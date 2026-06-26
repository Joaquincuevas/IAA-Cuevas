"""
Prompts y validadores Pydantic para las llamadas batch a Groq.

Dos templates:
  build_conexiones_prompt  — dado un curso, sus RAs y sus PEs candidatos,
                             pide un JSON de conexiones RA → PE.
  build_redundancia_prompt — dado un cluster de RAs similares,
                             pide confirmar cuáles son pedagógicamente redundantes.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, field_validator


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ConexionItem(BaseModel):
    ra_id: str
    pe_id: str
    confianza: float
    razon: str

    @field_validator("confianza")
    @classmethod
    def clamp(cls, v: float) -> float:
        return max(0.0, min(1.0, float(v)))

    @field_validator("pe_id")
    @classmethod
    def normalize_pe(cls, v: str) -> str:
        v = v.strip()
        if not v.upper().startswith("PE"):
            v = "PE" + v
        return v.upper().replace(" ", "")


class GapItem(BaseModel):
    pe_id: str
    nota: str


class ConexionesResponse(BaseModel):
    conexiones: list[ConexionItem]
    gaps: list[GapItem] = []


class ParRedundante(BaseModel):
    ra_id_a: str
    ra_id_b: str
    tipo: str = "semantica"   # 'semantica' | 'curricular' | 'exacta'
    razon: str

    @field_validator("tipo")
    @classmethod
    def normalize_tipo(cls, v: str) -> str:
        v = (v or "semantica").strip().lower()
        if v not in ("semantica", "curricular", "exacta"):
            return "semantica"
        return v


class RedundanciaResponse(BaseModel):
    pares_redundantes: list[ParRedundante]
    pares_complementarios: list[str] = []   # ra_ids que NO son redundantes


# ── Prompt builders ───────────────────────────────────────────────────────────

def build_conexiones_prompt(
    curso_id: str,
    curso_nombre: str,
    carrera: str,
    ras: list[dict],           # [{"id": "ICA_4130-2", "texto": "..."}]
    pes_candidatos: list[dict], # [{"pe_id": "PE10", "texto": "..."}]
) -> str:
    ra_lines = "\n".join(
        f'  - {r["id"]}: "{r["texto"]}"'
        for r in ras
    )
    pe_lines = "\n".join(
        f'  - {p["pe_id"]}: "{p["texto"]}"'
        for p in pes_candidatos
    )

    return f"""Eres un experto en diseño curricular de ingeniería de la Universidad de los Andes (Chile).
Tu tarea es identificar conexiones granulares entre los Resultados de Aprendizaje (RAs) de UN curso
y los Perfiles de Egreso (PE) a los que ese curso tributa según la matriz curricular.

CURSO: {curso_id} — {curso_nombre} (carrera {carrera})

RESULTADOS DE APRENDIZAJE del curso (evalúa cada uno):
{ra_lines}

PERFILES DE EGRESO candidatos para este curso (solo evalúa estos PEs, no otros):
{pe_lines}

ENFOQUE DEL ANÁLISIS:
- Trabajas curso por curso: recibes TODOS los RAs del curso y un subconjunto de PEs relevantes.
- Para cada RA, revisa cuáles PEs calzan según el contenido textual del objetivo.
- NO es necesario que cada RA se conecte con todos los PEs, ni que todos los PEs queden cubiertos.
- Lo deseable: que cada RA tenga al menos UN PE con confianza alta, si existe un vínculo razonable.
- Si un RA no calza razonablemente con ningún PE, déjalo sin conexión (no fuerces enlaces inventados).

REGLAS DE CONFIANZA (0.0–1.0):
- 0.8–1.0: conexión directa y explícita.
- 0.5–0.79: conexión razonable pero indirecta.
- 0.1–0.49: conexión débil o tangencial — INCLUIR con confianza honesta (no omitir).
- 0.0: omitir (sin vínculo real).

OTRAS REGLAS:
1. Un RA puede mapear a 0, 1 o varios PEs; incluye todos los vínculos con confianza > 0.
2. Si el curso tributa un PE pero ningún RA lo cubre razonablemente (ningún RA ≥ 0.35), inclúyelo en "gaps".
3. NO inventes IDs ni PEs. Usa exactamente los IDs provistos.
4. Responde SOLO con JSON válido, sin texto adicional.

Responde con este formato JSON exacto:
{{
  "conexiones": [
    {{
      "ra_id": "<id exacto del RA>",
      "pe_id": "<PE_ID exacto>",
      "confianza": <número entre 0.0 y 1.0>,
      "razon": "<explicación breve en español (máx 120 caracteres)>"
    }}
  ],
  "gaps": [
    {{
      "pe_id": "<PE_ID exacto>",
      "nota": "<por qué ningún RA lo cubre bien>"
    }}
  ]
}}"""


def build_redundancia_prompt(
    carrera: str,
    cluster: list[dict],   # [{"id", "curso", "curso_nombre", "texto"}]
) -> str:
    ra_lines_parts = []
    for r in cluster:
        curso = r["curso"]
        nombre = r.get("curso_nombre") or ""
        curso_label = f"{curso} — {nombre}" if nombre else curso
        ra_lines_parts.append(f'  - {r["id"]} (curso {curso_label}): "{r["texto"]}"')
    ra_lines = "\n".join(ra_lines_parts)

    return f"""Eres un experto en diseño curricular de ingeniería de la Universidad de los Andes (Chile).
Analiza el siguiente grupo de Resultados de Aprendizaje (RAs) de la carrera {carrera} que tienen alta similitud textual.

RESULTADOS DE APRENDIZAJE del cluster:
{ra_lines}

TAREA: Determina cuáles pares son pedagógicamente REDUNDANTES vs COMPLEMENTARIOS.

Criterios:
- REDUNDANTE ("semantica"): mismo verbo de acción + mismo objeto + mismo nivel cognitivo, sin progresión de profundidad.
- REDUNDANTE ("curricular"): mismo contenido en cursos distintos o semestres consecutivos sin escalamiento pedagógico.
- COMPLEMENTARIO: mismo tema pero distinto nivel (introducción vs aplicación), herramienta, contexto o profundidad.
- NO marques redundante solo por compartir frases genéricas de plantilla RA (p. ej. "el estudiante será capaz de…").

INSTRUCCIONES:
1. Lista solo los pares verdaderamente redundantes.
2. Para cada par, indica el tipo y una razón breve.
3. Si ningún par es redundante, devuelve lista vacía.
4. Responde SOLO con JSON válido, sin texto adicional.

Responde con este formato JSON exacto:
{{
  "pares_redundantes": [
    {{
      "ra_id_a": "<id exacto>",
      "ra_id_b": "<id exacto>",
      "tipo": "semantica",
      "razon": "<explicación breve en español (máx 120 caracteres)>"
    }}
  ],
  "pares_complementarios": ["<ra_id>", "<ra_id>"]
}}"""
