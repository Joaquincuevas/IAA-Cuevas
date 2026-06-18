"""
Motor de análisis IA (batch, no tiempo real).

Dos pipelines:
  run_conexiones(job_id, data, matrices, groq_key, carrera_filter)
    — por cada curso activo, llama a Groq para proponer RA→PE con prefiltro TF-IDF.

  run_redundancia(job_id, data, groq_key, carrera_filter)
    — TF-IDF agrupa RAs similares en clusters; Groq confirma cuáles son redundantes.

La función pública run_job(job_id, job_type, carrera, groq_key) orquesta ambos
y actualiza el job en SQLite (done/error).

Invalidación por hash:
  excel_hash(paths) — MD5 combinado de los Excel de datos.
  Si el hash coincide con el job anterior completado, no recalcula.
"""
from __future__ import annotations

import json
import re
import time
import hashlib
from pathlib import Path
from typing import Any

import pandas as pd

import ai_db
import ai_prompts

# Importación lazy de groq y sklearn para no requerir en entornos sin esas libs
_groq_client = None


def _get_groq(api_key: str):
    global _groq_client
    from groq import Groq
    if _groq_client is None:
        _groq_client = Groq(api_key=api_key)
    return _groq_client


# ── Hash Excel ────────────────────────────────────────────────────────────────
def excel_hash(paths: list[Path]) -> str:
    h = hashlib.md5()
    for p in sorted(paths):
        if p.exists():
            with open(p, "rb") as f:
                h.update(f.read(65536))   # primeros 64 KB son suficientes
            h.update(str(p.stat().st_size).encode())
    return h.hexdigest()[:16]


def should_skip(job_type: str, carrera: str | None, new_hash: str) -> bool:
    """True si ya existe un job done con el mismo hash para ese tipo/carrera."""
    latest = ai_db.get_latest_job(job_type, carrera)
    if not latest:
        return False
    return latest.get("excel_hash") == new_hash


# ── TF-IDF prefiltro ──────────────────────────────────────────────────────────
def _tfidf_top_pes(
    ra_texts: list[str],
    pe_texts: list[str],
    top_k: int = 3,
) -> list[list[int]]:
    """
    Devuelve, para cada RA, los índices de los top_k PEs candidatos
    según similitud TF-IDF coseno. Usado como prefiltro antes de llamar Groq.
    """
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np

    all_texts = ra_texts + pe_texts
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1)
    try:
        tfidf = vec.fit_transform(all_texts)
    except ValueError:
        return [list(range(len(pe_texts)))] * len(ra_texts)

    ra_vecs = tfidf[: len(ra_texts)]
    pe_vecs = tfidf[len(ra_texts):]
    sims = cosine_similarity(ra_vecs, pe_vecs)

    result = []
    for row in sims:
        idxs = row.argsort()[::-1][:top_k]
        result.append(idxs.tolist())
    return result


def _tfidf_clusters(
    ra_ids: list[str],
    ra_texts: list[str],
    threshold: float = 0.55,
) -> list[list[int]]:
    """
    Agrupa los RAs en clusters por similitud TF-IDF coseno.
    Devuelve lista de clusters (cada cluster = lista de índices en ra_ids).
    Solo retorna clusters de tamaño ≥ 2.
    """
    if len(ra_ids) < 2:
        return []

    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np

    vec = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=1)
    try:
        tfidf = vec.fit_transform(ra_texts)
    except ValueError:
        return []

    sims = cosine_similarity(tfidf)
    n = len(ra_ids)

    # Union-Find para componentes conexas
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        pa, pb = find(a), find(b)
        if pa != pb:
            parent[pa] = pb

    for i in range(n):
        for j in range(i + 1, n):
            if sims[i, j] >= threshold:
                union(i, j)

    from collections import defaultdict
    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    return [g for g in groups.values() if len(g) >= 2]


# ── Groq call helper ──────────────────────────────────────────────────────────
def _call_groq(client, prompt: str, model: str = "llama-3.1-8b-instant") -> str:
    completion = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=2048,
    )
    return completion.choices[0].message.content or ""


def _extract_json(text: str) -> dict:
    """Extract first JSON object from text (handles markdown code fences)."""
    text = text.strip()
    # Remove markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE)
    text = text.strip()
    # Find first { ... }
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in response")
    depth = 0
    for i, c in enumerate(text[start:], start):
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    raise ValueError("Unclosed JSON object in response")


def _progress(
    job_id: int,
    *,
    phase: str,
    step: int,
    total: int,
    message: str,
    extra: dict | None = None,
) -> None:
    pct = round(step / total * 100, 1) if total > 0 else 0
    payload: dict[str, Any] = {
        "phase": phase,
        "step": step,
        "total_steps": total,
        "pct": pct,
        "message": message,
    }
    if extra:
        payload.update(extra)
    ai_db.update_job_progress(job_id, payload)


def _conexiones_work_items(
    data: dict,
    matrices: dict,
    carrera_filter: str | None,
) -> list[tuple[str, str, str, list, list]]:
    """Lista de (carrera, curso_norm, curso_id, ras, pe_ids) a procesar."""
    df_obj: pd.DataFrame = data["objectives"]
    df_trib: pd.DataFrame = matrices["tributacion"]
    CARRERAS = [carrera_filter] if carrera_filter else ["ICA", "ICC", "ICE", "IOC", "ICI"]

    curso_pe_map: dict[str, dict[str, list[str]]] = {}
    for _, row in df_trib.iterrows():
        car = str(row["carrera"]).strip()
        curso = str(row["codigo_curso"]).strip()
        pe_label = f"PE{int(row['competencia_id'])}"
        curso_pe_map.setdefault(car, {}).setdefault(curso, [])
        if pe_label not in curso_pe_map[car][curso]:
            curso_pe_map[car][curso].append(pe_label)

    items: list[tuple[str, str, str, list, list]] = []
    for carrera in CARRERAS:
        df_car = df_obj[df_obj["Carrera"] == carrera].copy()
        for curso_norm in df_car["ID"].str.replace("_", "", 1, regex=False).unique().tolist():
            pe_ids = curso_pe_map.get(carrera, {}).get(curso_norm, [])
            if not pe_ids:
                continue
            curso_id = curso_norm[:3] + "_" + curso_norm[3:]
            df_curso = df_car[df_car["ID"] == curso_id]
            if df_curso.empty:
                continue
            ras = [
                {"id": str(row["ID_Objetivo"]).strip(), "texto": str(row.get("Objetivo", "")).strip()}
                for _, row in df_curso.iterrows()
                if str(row.get("Objetivo", "")).strip()
            ]
            if ras:
                items.append((carrera, curso_norm, curso_id, ras, pe_ids))
    return items


# ── Pipeline 1: Conexiones RA→PE ──────────────────────────────────────────────
def run_conexiones(
    job_id: int,
    data: dict,
    matrices: dict,
    groq_key: str,
    carrera_filter: str | None = None,
) -> dict:
    """
    Por cada curso activo: TF-IDF prefiltro → Groq → insertar propuestas.
    Retorna dict de stats.
    """
    client = _get_groq(groq_key)
    df_obj: pd.DataFrame = data["objectives"]         # ID, ID_Objetivo, Nombre, Objetivo, Carrera
    df_trib: pd.DataFrame = matrices["tributacion"]   # codigo_curso, competencia_id, competencia_texto, nivel, carrera
    df_comp: pd.DataFrame = matrices["competencias"]  # carrera, competencia_id, competencia_texto

    CARRERAS = [carrera_filter] if carrera_filter else ["ICA", "ICC", "ICE", "IOC", "ICI"]

    # PE text lookup: carrera → { "PE5" → texto }
    pe_text_map: dict[str, dict[str, str]] = {}
    for _, row in df_comp.iterrows():
        car = str(row["carrera"]).strip()
        pe_label = f"PE{int(row['competencia_id'])}"
        pe_text_map.setdefault(car, {})[pe_label] = str(row["competencia_texto"]).strip()

    # PE per course: carrera → { curso_norm → [pe_ids] }
    curso_pe_map: dict[str, dict[str, list[str]]] = {}
    for _, row in df_trib.iterrows():
        car = str(row["carrera"]).strip()
        curso = str(row["codigo_curso"]).strip()
        pe_label = f"PE{int(row['competencia_id'])}"
        curso_pe_map.setdefault(car, {}).setdefault(curso, [])
        if pe_label not in curso_pe_map[car][curso]:
            curso_pe_map[car][curso].append(pe_label)

    stats = {"cursos_procesados": 0, "propuestas": 0, "errores": 0, "gaps": 0}
    all_proposals: list[dict] = []

    work_items = _conexiones_work_items(data, matrices, carrera_filter)
    total = len(work_items)
    if total == 0:
        _progress(job_id, phase="conexiones", step=0, total=1, message="Sin cursos con PEs en la matriz para analizar")
        return stats

    _progress(
        job_id,
        phase="conexiones",
        step=0,
        total=total,
        message=f"Iniciando análisis de {total} cursos…",
        extra={"propuestas": 0, "errores": 0},
    )

    current_carrera: str | None = None
    for step_idx, (carrera, curso_norm, curso_id_underscore, ras, pe_ids) in enumerate(work_items, start=1):
        if current_carrera != carrera:
            ai_db.delete_ra_pe_proposals_for_carrera(carrera)
            current_carrera = carrera

        df_curso = df_obj[df_obj["ID"] == curso_id_underscore]
        curso_nombre = str(df_curso.iloc[0].get("Nombre", curso_norm)).strip() if not df_curso.empty else curso_norm

        _progress(
            job_id,
            phase="conexiones",
            step=step_idx,
            total=total,
            message=f"[{carrera}] Consultando Groq: {curso_id_underscore} ({step_idx}/{total})",
            extra={"propuestas": stats["propuestas"], "errores": stats["errores"], "curso": curso_id_underscore},
        )

        pe_texts = [pe_text_map.get(carrera, {}).get(pid, pid) for pid in pe_ids]
        ra_texts_only = [r["texto"] for r in ras]
        top_pe_idxs = _tfidf_top_pes(ra_texts_only, pe_texts, top_k=min(3, len(pe_ids)))

        candidate_pe_idxs = set()
        for idxs in top_pe_idxs:
            candidate_pe_idxs.update(idxs)
        pes_candidatos = [
            {"pe_id": pe_ids[i], "texto": pe_texts[i]}
            for i in sorted(candidate_pe_idxs)
        ]
        if len(pes_candidatos) > 6:
            pes_candidatos = pes_candidatos[:6]

        prompt = ai_prompts.build_conexiones_prompt(
            curso_id=curso_id_underscore,
            curso_nombre=curso_nombre,
            carrera=carrera,
            ras=ras,
            pes_candidatos=pes_candidatos,
        )

        try:
            raw = _call_groq(client, prompt)
            raw_json = _extract_json(raw)
            response = ai_prompts.ConexionesResponse(**raw_json)
        except Exception:
            try:
                raw = _call_groq(client, prompt + "\n\nResponde ÚNICAMENTE con JSON, sin ningún texto adicional.")
                raw_json = _extract_json(raw)
                response = ai_prompts.ConexionesResponse(**raw_json)
            except Exception:
                stats["errores"] += 1
                time.sleep(0.5)
                continue

        valid_pe_ids = set(pe_ids)
        course_proposals: list[dict] = []
        for conn_item in response.conexiones:
            if conn_item.pe_id not in valid_pe_ids:
                continue
            if conn_item.confianza < 0.3:
                continue
            pe_texto = pe_text_map.get(carrera, {}).get(conn_item.pe_id, conn_item.pe_id)
            ra_match = next((r for r in ras if r["id"] == conn_item.ra_id), None)
            if not ra_match:
                continue
            course_proposals.append({
                "carrera": carrera,
                "ra_id": conn_item.ra_id,
                "ra_texto": ra_match["texto"],
                "curso_id": curso_id_underscore,
                "curso_nombre": curso_nombre,
                "pe_id": conn_item.pe_id,
                "pe_texto": pe_texto,
                "confianza": conn_item.confianza,
                "razon": conn_item.razon,
            })

        all_proposals.extend(course_proposals)
        stats["gaps"] += len(response.gaps)
        stats["cursos_procesados"] += 1
        stats["propuestas"] = len(all_proposals)
        time.sleep(0.22)

    stats["propuestas"] = ai_db.bulk_insert_ra_pe(job_id, all_proposals)

    _progress(
        job_id,
        phase="conexiones",
        step=total,
        total=total,
        message=f"Conexiones completadas: {stats['propuestas']} propuestas, {stats['errores']} errores",
        extra={"propuestas": stats["propuestas"], "errores": stats["errores"]},
    )

    return stats


# ── Pipeline 2: Redundancia semántica ────────────────────────────────────────
def run_redundancia(
    job_id: int,
    data: dict,
    groq_key: str,
    carrera_filter: str | None = None,
) -> dict:
    """
    Por carrera: TF-IDF clusters → Groq confirma pares redundantes → insertar propuestas.
    """
    client = _get_groq(groq_key)
    df_obj: pd.DataFrame = data["objectives"]

    CARRERAS = [carrera_filter] if carrera_filter else ["ICA", "ICC", "ICE", "IOC", "ICI"]
    stats = {"cursos_procesados": 0, "clusters": 0, "propuestas": 0, "errores": 0}

    # Pre-build work units: (carrera, sub_indices, ra_ids, ra_texts, curso_ids)
    work_units: list[tuple] = []
    for carrera in CARRERAS:
        df_car = df_obj[df_obj["Carrera"] == carrera].copy()
        ra_ids = df_car["ID_Objetivo"].tolist()
        ra_texts = [str(r).strip() for r in df_car["Objetivo"].tolist()]
        curso_ids = df_car["ID"].tolist()
        if len(ra_ids) < 2:
            continue
        clusters = _tfidf_clusters(ra_ids, ra_texts, threshold=0.52)
        stats["clusters"] += len(clusters)
        for cluster_idxs in clusters:
            if len(cluster_idxs) > 10:
                sub_clusters = [cluster_idxs[i : i + 8] for i in range(0, len(cluster_idxs), 6)]
            else:
                sub_clusters = [cluster_idxs]
            for sub in sub_clusters:
                work_units.append((carrera, sub, ra_ids, ra_texts, curso_ids))

    total = len(work_units)
    if total == 0:
        _progress(job_id, phase="redundancia", step=0, total=1, message="No se encontraron clusters similares")
        return stats

    _progress(
        job_id,
        phase="redundancia",
        step=0,
        total=total,
        message=f"Analizando {total} clusters de redundancia…",
        extra={"propuestas": 0, "errores": 0},
    )

    all_proposals: list[dict] = []
    enrich_context: dict[str, tuple[list, list]] = {}

    for step_idx, (carrera, sub, ra_ids, ra_texts, curso_ids) in enumerate(work_units, start=1):
        if carrera not in enrich_context:
            ai_db.delete_redundancy_proposals_for_carrera(carrera)
            enrich_context[carrera] = (ra_ids, ra_texts)

        cluster_items = [
            {"id": ra_ids[i], "curso": str(curso_ids[i]).strip(), "texto": ra_texts[i]}
            for i in sub
        ]

        _progress(
            job_id,
            phase="redundancia",
            step=step_idx,
            total=total,
            message=f"[{carrera}] Cluster {step_idx}/{total} ({len(cluster_items)} RAs)",
            extra={"propuestas": len(all_proposals), "errores": stats["errores"]},
        )

        prompt = ai_prompts.build_redundancia_prompt(carrera=carrera, cluster=cluster_items)

        try:
            raw = _call_groq(client, prompt)
            raw_json = _extract_json(raw)
            response = ai_prompts.RedundanciaResponse(**raw_json)
        except Exception:
            try:
                raw = _call_groq(client, prompt + "\n\nResponde ÚNICAMENTE con JSON, sin texto adicional.")
                raw_json = _extract_json(raw)
                response = ai_prompts.RedundanciaResponse(**raw_json)
            except Exception:
                stats["errores"] += 1
                time.sleep(0.5)
                continue

        valid_ra_ids = {item["id"] for item in cluster_items}
        ra_to_curso = {item["id"]: item["curso"] for item in cluster_items}
        ra_to_texto = {item["id"]: item["texto"] for item in cluster_items}

        for par in response.pares_redundantes:
            if par.ra_id_a not in valid_ra_ids or par.ra_id_b not in valid_ra_ids:
                continue
            all_proposals.append({
                "carrera": carrera,
                "ra_id_a": par.ra_id_a,
                "ra_texto_a": ra_to_texto.get(par.ra_id_a, ""),
                "curso_a": ra_to_curso.get(par.ra_id_a, ""),
                "ra_id_b": par.ra_id_b,
                "ra_texto_b": ra_to_texto.get(par.ra_id_b, ""),
                "curso_b": ra_to_curso.get(par.ra_id_b, ""),
                "similitud": 0.7,
                "razon": par.razon,
                "tipo": par.tipo if par.tipo in ("semantica", "curricular") else "semantica",
            })

        time.sleep(0.22)
        stats["cursos_procesados"] += 1

    for carrera, (ra_ids, ra_texts) in enrich_context.items():
        car_props = [p for p in all_proposals if p["carrera"] == carrera]
        _enrich_similitud(car_props, ra_ids, ra_texts)

    stats["propuestas"] = ai_db.bulk_insert_redundancy(job_id, all_proposals)

    _progress(
        job_id,
        phase="redundancia",
        step=total,
        total=total,
        message=f"Redundancia completada: {stats['propuestas']} pares detectados",
        extra={"propuestas": stats["propuestas"], "errores": stats["errores"]},
    )

    return stats


def _enrich_similitud(proposals: list[dict], ra_ids: list[str], ra_texts: list[str]) -> None:
    """Compute actual TF-IDF cosine similarity for each pair and update in-place."""
    if not proposals or len(ra_ids) < 2:
        return
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    ra_index = {rid: i for i, rid in enumerate(ra_ids)}
    vec = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=1)
    try:
        tfidf = vec.fit_transform(ra_texts)
    except Exception:
        return

    for p in proposals:
        i = ra_index.get(p["ra_id_a"])
        j = ra_index.get(p["ra_id_b"])
        if i is not None and j is not None:
            sim = float(cosine_similarity(tfidf[i], tfidf[j])[0, 0])
            p["similitud"] = round(sim, 4)


# ── Orquestador principal ─────────────────────────────────────────────────────
def run_job(
    job_id: int,
    job_type: str,
    carrera: str | None,
    groq_key: str,
    data: dict,
    matrices: dict,
) -> None:
    """
    Entry point para threading.Thread. Ejecuta el pipeline según job_type
    y actualiza el job en SQLite al final.
    """
    try:
        stats: dict[str, Any] = {}

        if job_type in ("conexiones", "all"):
            _progress(job_id, phase="conexiones", step=0, total=1, message="Preparando análisis de conexiones…")
            s = run_conexiones(job_id, data, matrices, groq_key, carrera)
            stats["conexiones"] = s

        if job_type in ("redundancia", "all"):
            _progress(job_id, phase="redundancia", step=0, total=1, message="Preparando análisis de redundancia…")
            s = run_redundancia(job_id, data, groq_key, carrera)
            stats["redundancia"] = s

        ai_db.finish_job(job_id, stats)

    except Exception as e:
        import traceback
        ai_db.fail_job(job_id, traceback.format_exc()[:2000])
