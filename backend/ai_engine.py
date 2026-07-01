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
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, NamedTuple

import pandas as pd

import ai_db
import ai_prompts

TEST_CONEXIONES_LIMIT = 5

# Workers Groq en paralelo (free tier: 2 recomendado por límite TPM 6K/min)
GROQ_MAX_WORKERS = max(1, min(int(os.environ.get("GROQ_MAX_WORKERS", "2")), 4))

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


# ── Duplicados exactos (sin IA) ───────────────────────────────────────────────
_TRAILING_PUNCT_RE = re.compile(r"[.,;:]+$")


def _normalize_ra_text(text: str) -> str:
    """Normalización ligera para comparar RAs textualmente iguales."""
    s = (text or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = _TRAILING_PUNCT_RE.sub("", s)
    return s


def _ra_pair_key(ra_id_a: str, ra_id_b: str) -> frozenset[str]:
    a, b = ra_id_a.strip(), ra_id_b.strip()
    return frozenset({a, b})


def _find_exact_redundancy_pairs(
    carrera: str,
    ra_ids: list[str],
    ra_texts: list[str],
    curso_ids: list,
) -> list[dict]:
    """Pares con texto idéntico tras normalización ligera."""
    groups: dict[str, list[int]] = {}
    for i, text in enumerate(ra_texts):
        norm = _normalize_ra_text(text)
        if not norm:
            continue
        groups.setdefault(norm, []).append(i)

    proposals: list[dict] = []
    seen: set[frozenset[str]] = set()
    for idxs in groups.values():
        if len(idxs) < 2:
            continue
        for a in range(len(idxs)):
            for b in range(a + 1, len(idxs)):
                i, j = idxs[a], idxs[b]
                ra_a, ra_b = str(ra_ids[i]).strip(), str(ra_ids[j]).strip()
                key = _ra_pair_key(ra_a, ra_b)
                if key in seen:
                    continue
                seen.add(key)
                if ra_a <= ra_b:
                    proposals.append({
                        "carrera": carrera,
                        "ra_id_a": ra_a,
                        "ra_texto_a": ra_texts[i],
                        "curso_a": str(curso_ids[i]).strip(),
                        "ra_id_b": ra_b,
                        "ra_texto_b": ra_texts[j],
                        "curso_b": str(curso_ids[j]).strip(),
                        "similitud": 1.0,
                        "razon": "Texto idéntico (detección automática)",
                        "tipo": "exacta",
                    })
                else:
                    proposals.append({
                        "carrera": carrera,
                        "ra_id_a": ra_b,
                        "ra_texto_a": ra_texts[j],
                        "curso_a": str(curso_ids[j]).strip(),
                        "ra_id_b": ra_a,
                        "ra_texto_b": ra_texts[i],
                        "curso_b": str(curso_ids[i]).strip(),
                        "similitud": 1.0,
                        "razon": "Texto idéntico (detección automática)",
                        "tipo": "exacta",
                    })
    return proposals


def _cluster_all_same_text(sub: list[int], ra_texts: list[str]) -> bool:
    norms = {_normalize_ra_text(ra_texts[i]) for i in sub}
    norms.discard("")
    return len(norms) <= 1 and len(sub) >= 2


def _course_name_map(data: dict) -> dict[str, str]:
    general = data.get("general")
    if general is None:
        return {}
    return dict(
        zip(
            general["ID"].astype(str).str.strip(),
            general["Nombre"].astype(str).str.strip(),
        )
    )


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
def _retry_after_seconds(exc: Exception, attempt: int) -> float | None:
    """Segundos a esperar ante 429; None si no es rate limit."""
    status = getattr(exc, "status_code", None)
    if status is None:
        resp = getattr(exc, "response", None)
        status = getattr(resp, "status_code", None) if resp else None
    if status != 429:
        return None
    headers = {}
    resp = getattr(exc, "response", None)
    if resp is not None:
        headers = getattr(resp, "headers", None) or {}
    ra = headers.get("retry-after") or headers.get("Retry-After")
    if ra is not None:
        try:
            return float(ra) + 0.25
        except (TypeError, ValueError):
            pass
    return min(30.0, 2.0 * (attempt + 1))


def _call_groq(
    client,
    prompt: str,
    model: str = "llama-3.1-8b-instant",
    max_retries: int = 6,
) -> str:
    last_exc: Exception | None = None
    for attempt in range(max_retries):
        try:
            completion = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=2048,
            )
            return completion.choices[0].message.content or ""
        except Exception as e:
            last_exc = e
            wait = _retry_after_seconds(e, attempt)
            if wait is not None and attempt < max_retries - 1:
                time.sleep(wait)
                continue
            raise
    if last_exc:
        raise last_exc
    return ""


def _parse_conexiones_response(client, prompt: str) -> ai_prompts.ConexionesResponse:
    suffix = "\n\nResponde ÚNICAMENTE con JSON, sin ningún texto adicional."
    for i, extra in enumerate(("", suffix)):
        try:
            raw = _call_groq(client, prompt + extra)
            return ai_prompts.ConexionesResponse(**_extract_json(raw))
        except Exception:
            if i == 1:
                raise
    raise ValueError("Respuesta de conexiones inválida")


def _parse_redundancia_response(client, prompt: str) -> ai_prompts.RedundanciaResponse:
    suffix = "\n\nResponde ÚNICAMENTE con JSON, sin texto adicional."
    for i, extra in enumerate(("", suffix)):
        try:
            raw = _call_groq(client, prompt + extra)
            return ai_prompts.RedundanciaResponse(**_extract_json(raw))
        except Exception:
            if i == 1:
                raise
    raise ValueError("Respuesta de redundancia inválida")


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
    if ai_db.is_job_cancelled(job_id):
        raise ai_db.JobCancelled()
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
    # Carreras dinámicas: incluye tanto las base como las planillas subidas
    CARRERAS = (
        [carrera_filter]
        if carrera_filter
        else sorted(df_trib["carrera"].astype(str).str.strip().unique().tolist())
    )

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


class _ConexionResult(NamedTuple):
    carrera: str
    curso_id: str
    proposals: list[dict]
    gaps: int
    error: bool


def _process_conexion_course(
    groq_key: str,
    df_obj: pd.DataFrame,
    pe_text_map: dict[str, dict[str, str]],
    carrera: str,
    curso_norm: str,
    curso_id_underscore: str,
    ras: list,
    pe_ids: list[str],
) -> _ConexionResult:
    client = _get_groq(groq_key)
    df_curso = df_obj[df_obj["ID"] == curso_id_underscore]
    curso_nombre = (
        str(df_curso.iloc[0].get("Nombre", curso_norm)).strip()
        if not df_curso.empty
        else curso_norm
    )

    pe_texts = [pe_text_map.get(carrera, {}).get(pid, pid) for pid in pe_ids]
    ra_texts_only = [r["texto"] for r in ras]
    top_pe_idxs = _tfidf_top_pes(ra_texts_only, pe_texts, top_k=min(3, len(pe_ids)))

    candidate_pe_idxs: set[int] = set()
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
        response = _parse_conexiones_response(client, prompt)
    except Exception:
        return _ConexionResult(carrera, curso_id_underscore, [], 0, True)

    valid_pe_ids = set(pe_ids)
    course_proposals: list[dict] = []
    for conn_item in response.conexiones:
        if conn_item.pe_id not in valid_pe_ids:
            continue
        if conn_item.confianza <= 0:
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

    return _ConexionResult(
        carrera,
        curso_id_underscore,
        course_proposals,
        len(response.gaps),
        False,
    )


class _RedundanciaResult(NamedTuple):
    carrera: str
    proposals: list[dict]
    error: bool


def _process_redundancia_cluster(
    groq_key: str,
    carrera: str,
    sub: list[int],
    ra_ids: list[str],
    ra_texts: list[str],
    curso_ids: list,
    curso_nombre_map: dict[str, str],
    exact_pair_keys: set[frozenset[str]],
) -> _RedundanciaResult:
    client = _get_groq(groq_key)
    cluster_items = []
    for i in sub:
        curso = str(curso_ids[i]).strip()
        cluster_items.append({
            "id": ra_ids[i],
            "curso": curso,
            "curso_nombre": curso_nombre_map.get(curso, ""),
            "texto": ra_texts[i],
        })
    prompt = ai_prompts.build_redundancia_prompt(carrera=carrera, cluster=cluster_items)

    try:
        response = _parse_redundancia_response(client, prompt)
    except Exception:
        return _RedundanciaResult(carrera, [], True)

    valid_ra_ids = {item["id"] for item in cluster_items}
    ra_to_curso = {item["id"]: item["curso"] for item in cluster_items}
    ra_to_texto = {item["id"]: item["texto"] for item in cluster_items}
    proposals: list[dict] = []

    for par in response.pares_redundantes:
        if par.ra_id_a not in valid_ra_ids or par.ra_id_b not in valid_ra_ids:
            continue
        if _ra_pair_key(par.ra_id_a, par.ra_id_b) in exact_pair_keys:
            continue
        proposals.append({
            "carrera": carrera,
            "ra_id_a": par.ra_id_a,
            "ra_texto_a": ra_to_texto.get(par.ra_id_a, ""),
            "curso_a": ra_to_curso.get(par.ra_id_a, ""),
            "ra_id_b": par.ra_id_b,
            "ra_texto_b": ra_to_texto.get(par.ra_id_b, ""),
            "curso_b": ra_to_curso.get(par.ra_id_b, ""),
            "similitud": 0.7,
            "razon": par.razon,
            "tipo": par.tipo if par.tipo in ("semantica", "curricular", "exacta") else "semantica",
        })

    return _RedundanciaResult(carrera, proposals, False)


# ── Pipeline 1: Conexiones RA→PE ──────────────────────────────────────────────
def run_conexiones(
    job_id: int,
    data: dict,
    matrices: dict,
    groq_key: str,
    carrera_filter: str | None = None,
) -> dict:
    """
    Por cada curso activo: TF-IDF prefiltro → Groq (paralelo) → insertar propuestas.
    Retorna dict de stats.
    """
    df_obj: pd.DataFrame = data["objectives"]
    df_comp: pd.DataFrame = matrices["competencias"]

    pe_text_map: dict[str, dict[str, str]] = {}
    for _, row in df_comp.iterrows():
        car = str(row["carrera"]).strip()
        pe_label = f"PE{int(row['competencia_id'])}"
        pe_text_map.setdefault(car, {})[pe_label] = str(row["competencia_texto"]).strip()

    stats = {"cursos_procesados": 0, "propuestas": 0, "errores": 0, "gaps": 0}
    all_proposals: list[dict] = []

    work_items = _conexiones_work_items(data, matrices, carrera_filter)
    total = len(work_items)
    if total == 0:
        _progress(job_id, phase="conexiones", step=0, total=1, message="Sin cursos con PEs en la matriz para analizar")
        return stats

    for car in sorted({item[0] for item in work_items}):
        ai_db.delete_ra_pe_proposals_for_carrera(car)

    _progress(
        job_id,
        phase="conexiones",
        step=0,
        total=total,
        message=f"Iniciando análisis de {total} cursos ({GROQ_MAX_WORKERS} en paralelo)…",
        extra={"propuestas": 0, "errores": 0},
    )

    completed = 0
    lock = threading.Lock()
    cancelled = False

    def _apply_result(result: _ConexionResult) -> None:
        nonlocal completed
        with lock:
            completed += 1
            all_proposals.extend(result.proposals)
            stats["gaps"] += result.gaps
            if result.error:
                stats["errores"] += 1
            else:
                stats["cursos_procesados"] += 1
            stats["propuestas"] = len(all_proposals)
            _progress(
                job_id,
                phase="conexiones",
                step=completed,
                total=total,
                message=f"[{result.carrera}] {result.curso_id} — {completed}/{total} cursos",
                extra={
                    "propuestas": stats["propuestas"],
                    "errores": stats["errores"],
                    "curso": result.curso_id,
                },
            )

    with ThreadPoolExecutor(max_workers=GROQ_MAX_WORKERS) as pool:
        futures = [
            pool.submit(
                _process_conexion_course,
                groq_key,
                df_obj,
                pe_text_map,
                carrera,
                curso_norm,
                curso_id_underscore,
                ras,
                pe_ids,
            )
            for carrera, curso_norm, curso_id_underscore, ras, pe_ids in work_items
        ]

        for fut in as_completed(futures):
            if ai_db.is_job_cancelled(job_id):
                cancelled = True
                for pending in futures:
                    pending.cancel()
                break
            try:
                _apply_result(fut.result())
            except Exception:
                with lock:
                    stats["errores"] += 1

    if cancelled:
        if all_proposals:
            stats["propuestas"] = ai_db.bulk_insert_ra_pe(job_id, all_proposals)
        return stats

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


def run_conexiones_prueba(
    job_id: int,
    data: dict,
    matrices: dict,
    groq_key: str,
    carrera: str,
) -> dict:
    """
    Modo prueba: genera hasta TEST_CONEXIONES_LIMIT propuestas RA→PE para una carrera.
    No borra propuestas existentes.
    """
    df_obj: pd.DataFrame = data["objectives"]
    df_comp: pd.DataFrame = matrices["competencias"]

    pe_text_map: dict[str, dict[str, str]] = {}
    for _, row in df_comp.iterrows():
        car = str(row["carrera"]).strip()
        pe_label = f"PE{int(row['competencia_id'])}"
        pe_text_map.setdefault(car, {})[pe_label] = str(row["competencia_texto"]).strip()

    stats = {
        "modo": "prueba",
        "limite": TEST_CONEXIONES_LIMIT,
        "cursos_procesados": 0,
        "propuestas": 0,
        "errores": 0,
        "gaps": 0,
    }
    all_proposals: list[dict] = []

    work_items = _conexiones_work_items(data, matrices, carrera)
    total = len(work_items)
    if total == 0:
        _progress(
            job_id,
            phase="conexiones_prueba",
            step=0,
            total=1,
            message=f"Sin cursos con PEs en la matriz para {carrera}",
        )
        return stats

    _progress(
        job_id,
        phase="conexiones_prueba",
        step=0,
        total=total,
        message=f"Prueba: generando hasta {TEST_CONEXIONES_LIMIT} conexiones para {carrera}…",
        extra={"propuestas": 0, "errores": 0},
    )

    for step, (car, curso_norm, curso_id_underscore, ras, pe_ids) in enumerate(work_items, start=1):
        if ai_db.is_job_cancelled(job_id):
            break
        if len(all_proposals) >= TEST_CONEXIONES_LIMIT:
            break

        result = _process_conexion_course(
            groq_key,
            df_obj,
            pe_text_map,
            car,
            curso_norm,
            curso_id_underscore,
            ras,
            pe_ids,
        )
        stats["gaps"] += result.gaps
        if result.error:
            stats["errores"] += 1
        else:
            stats["cursos_procesados"] += 1

        remaining = TEST_CONEXIONES_LIMIT - len(all_proposals)
        all_proposals.extend(result.proposals[:remaining])

        _progress(
            job_id,
            phase="conexiones_prueba",
            step=step,
            total=total,
            message=f"[{car}] {curso_id_underscore} — {len(all_proposals)}/{TEST_CONEXIONES_LIMIT} propuestas",
            extra={
                "propuestas": len(all_proposals),
                "errores": stats["errores"],
                "curso": curso_id_underscore,
            },
        )

    if all_proposals:
        stats["propuestas"] = ai_db.bulk_insert_ra_pe(job_id, all_proposals)

    _progress(
        job_id,
        phase="conexiones_prueba",
        step=total,
        total=total,
        message=f"Prueba completada: {stats['propuestas']} propuestas generadas",
        extra={"propuestas": stats["propuestas"], "errores": stats["errores"]},
    )

    return stats


# ── Pipeline 2: Redundancia semántica ────────────────────────────────────────
# Umbral TF-IDF para prefiltro antes de Groq (sin bajar a 0.30: mucho ruido con union-find).
REDUNDANCIA_TFIDF_THRESHOLD = 0.52


def run_redundancia(
    job_id: int,
    data: dict,
    groq_key: str,
    carrera_filter: str | None = None,
) -> dict:
    """
    Por carrera: duplicados exactos → TF-IDF clusters (umbral 0.52) → Groq → insertar propuestas.
    """
    df_obj: pd.DataFrame = data["objectives"]
    curso_nombre_map = _course_name_map(data)

    # Redundancia trabaja sobre RAs (df_obj); usa todas las carreras con objetivos
    CARRERAS = (
        [carrera_filter]
        if carrera_filter
        else sorted(df_obj["Carrera"].dropna().astype(str).str.strip().unique().tolist())
    )
    stats = {
        "cursos_procesados": 0,
        "clusters": 0,
        "propuestas": 0,
        "exactas": 0,
        "errores": 0,
    }

    carrera_data: dict[str, tuple] = {}
    for carrera in CARRERAS:
        df_car = df_obj[df_obj["Carrera"] == carrera].copy()
        ra_ids = df_car["ID_Objetivo"].tolist()
        ra_texts = [str(r).strip() for r in df_car["Objetivo"].tolist()]
        curso_ids = df_car["ID"].tolist()
        if len(ra_ids) >= 2:
            carrera_data[carrera] = (ra_ids, ra_texts, curso_ids)

    for car in carrera_data:
        ai_db.delete_redundancy_proposals_for_carrera(car)

    exact_proposals: list[dict] = []
    exact_pair_keys: set[frozenset[str]] = set()
    for carrera, (ra_ids, ra_texts, curso_ids) in carrera_data.items():
        pairs = _find_exact_redundancy_pairs(carrera, ra_ids, ra_texts, curso_ids)
        exact_proposals.extend(pairs)
        for p in pairs:
            exact_pair_keys.add(_ra_pair_key(p["ra_id_a"], p["ra_id_b"]))

    if exact_proposals:
        stats["exactas"] = ai_db.bulk_insert_redundancy(job_id, exact_proposals)

    work_units: list[tuple] = []
    enrich_context: dict[str, tuple[list, list]] = {}
    for carrera, (ra_ids, ra_texts, curso_ids) in carrera_data.items():
        enrich_context[carrera] = (ra_ids, ra_texts)
        clusters = _tfidf_clusters(ra_ids, ra_texts, threshold=REDUNDANCIA_TFIDF_THRESHOLD)
        stats["clusters"] += len(clusters)
        for cluster_idxs in clusters:
            if len(cluster_idxs) > 10:
                sub_clusters = [cluster_idxs[i : i + 8] for i in range(0, len(cluster_idxs), 6)]
            else:
                sub_clusters = [cluster_idxs]
            for sub in sub_clusters:
                if _cluster_all_same_text(sub, ra_texts):
                    continue
                work_units.append((carrera, sub, ra_ids, ra_texts, curso_ids))

    total = len(work_units)
    if total == 0 and stats["exactas"] == 0:
        _progress(job_id, phase="redundancia", step=0, total=1, message="No se encontraron redundancias")
        stats["propuestas"] = stats["exactas"]
        return stats

    if total == 0:
        stats["propuestas"] = stats["exactas"]
        _progress(
            job_id,
            phase="redundancia",
            step=1,
            total=1,
            message=f"Solo duplicados exactos: {stats['exactas']} pares (sin llamadas Groq)",
            extra={"propuestas": stats["exactas"], "errores": 0},
        )
        return stats

    _progress(
        job_id,
        phase="redundancia",
        step=0,
        total=total,
        message=f"Analizando {total} clusters ({GROQ_MAX_WORKERS} en paralelo)…",
        extra={"propuestas": stats["exactas"], "errores": 0},
    )

    all_proposals: list[dict] = []
    completed = 0
    lock = threading.Lock()
    cancelled = False

    def _apply_result(result: _RedundanciaResult) -> None:
        nonlocal completed
        with lock:
            completed += 1
            all_proposals.extend(result.proposals)
            if result.error:
                stats["errores"] += 1
            else:
                stats["cursos_procesados"] += 1
            _progress(
                job_id,
                phase="redundancia",
                step=completed,
                total=total,
                message=f"[{result.carrera}] Cluster {completed}/{total}",
                extra={
                    "propuestas": stats["exactas"] + len(all_proposals),
                    "errores": stats["errores"],
                },
            )

    with ThreadPoolExecutor(max_workers=GROQ_MAX_WORKERS) as pool:
        futures = [
            pool.submit(
                _process_redundancia_cluster,
                groq_key,
                carrera,
                sub,
                ra_ids,
                ra_texts,
                curso_ids,
                curso_nombre_map,
                exact_pair_keys,
            )
            for carrera, sub, ra_ids, ra_texts, curso_ids in work_units
        ]

        for fut in as_completed(futures):
            if ai_db.is_job_cancelled(job_id):
                cancelled = True
                for pending in futures:
                    pending.cancel()
                break
            try:
                _apply_result(fut.result())
            except Exception:
                with lock:
                    stats["errores"] += 1

    if cancelled:
        if all_proposals:
            inserted = ai_db.bulk_insert_redundancy(job_id, all_proposals)
            stats["propuestas"] = stats["exactas"] + inserted
        else:
            stats["propuestas"] = stats["exactas"]
        return stats

    for carrera, (ra_ids, ra_texts) in enrich_context.items():
        car_props = [p for p in all_proposals if p["carrera"] == carrera]
        _enrich_similitud(car_props, ra_ids, ra_texts)

    inserted = ai_db.bulk_insert_redundancy(job_id, all_proposals) if all_proposals else 0
    stats["propuestas"] = stats["exactas"] + inserted

    _progress(
        job_id,
        phase="redundancia",
        step=total,
        total=total,
        message=f"Redundancia completada: {stats['propuestas']} pares ({stats['exactas']} exactos)",
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
        if p.get("tipo") == "exacta":
            continue
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

        if job_type == "conexiones_prueba":
            if not carrera:
                raise ValueError("El modo prueba requiere una carrera")
            _progress(job_id, phase="conexiones_prueba", step=0, total=1, message="Preparando prueba de conexiones…")
            s = run_conexiones_prueba(job_id, data, matrices, groq_key, carrera)
            stats["conexiones_prueba"] = s
            if ai_db.is_job_cancelled(job_id):
                ai_db.update_cancelled_stats(job_id, stats)
                return
        elif job_type in ("conexiones", "all"):
            _progress(job_id, phase="conexiones", step=0, total=1, message="Preparando análisis de conexiones…")
            s = run_conexiones(job_id, data, matrices, groq_key, carrera)
            stats["conexiones"] = s
            if ai_db.is_job_cancelled(job_id):
                ai_db.update_cancelled_stats(job_id, stats)
                return

        if job_type in ("redundancia", "all"):
            _progress(job_id, phase="redundancia", step=0, total=1, message="Preparando análisis de redundancia…")
            s = run_redundancia(job_id, data, groq_key, carrera)
            stats["redundancia"] = s
            if ai_db.is_job_cancelled(job_id):
                ai_db.update_cancelled_stats(job_id, stats)
                return

        ai_db.finish_job(job_id, stats)

    except ai_db.JobCancelled:
        ai_db.update_cancelled_stats(job_id, stats)
    except Exception as e:
        import traceback
        ai_db.fail_job(job_id, traceback.format_exc()[:2000])
