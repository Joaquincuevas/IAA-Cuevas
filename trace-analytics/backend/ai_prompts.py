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
    tipo: str = "semantica"   # 'semantica' | 'curricular'
    razon: str


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
Tu tarea es determinar qué Resultados de Aprendizaje (RAs) de un curso contribuyen directamente a cada Perfil de Egreso (PE) de la carrera.

CURSO: {curso_id} — {curso_nombre} (carrera {carrera})

RESULTADOS DE APRENDIZAJE del curso:
{ra_lines}

PERFILES DE EGRESO a los que este curso tributa (solo evalúa estos):
{pe_lines}

INSTRUCCIONES IMPORTANTES:
1. Para cada RA, decide a cuáles PEs contribuye directamente según su contenido textual.
2. Un RA puede mapear a 0, 1 o varios PEs. No todos deben tener conexión.
3. La confianza (0.0–1.0) refleja qué tan claramente el RA apunta a ese PE.
   - 0.8–1.0: conexión directa y explícita.
   - 0.5–0.79: conexión razonable pero indirecta.
   - 0.3–0.49: conexión débil o contextual.
   - < 0.3: no mapear, mejor omitir.
4. Si el curso tributa un PE pero ningún RA lo cubre bien, inclúyelo en "gaps".
5. NO inventes IDs ni PEs. Usa exactamente los IDs provistos.
6. Responde SOLO con JSON válido, sin texto adicional.

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
    cluster: list[dict],   # [{"id": "...", "curso": "...", "texto": "..."}]
) -> str:
    ra_lines = "\n".join(
        f'  - {r["id"]} (curso {r["curso"]}): "{r["texto"]}"'
        for r in cluster
    )

    return f"""Eres un experto en diseño curricular de ingeniería de la Universidad de los Andes (Chile).
Analiza el siguiente grupo de Resultados de Aprendizaje (RAs) de la carrera {carrera} que tienen alta similitud textual.

RESULTADOS DE APRENDIZAJE del cluster:
{ra_lines}

TAREA: Determina cuáles pares son pedagógicamente REDUNDANTES vs COMPLEMENTARIOS.

Criterios:
- REDUNDANTE ("semantica"): los dos RAs enseñan o evalúan lo mismo sin progresión de profundidad.
- REDUNDANTE ("curricular"): aparecen en semestres consecutivos con exactamente el mismo contenido, sin escalamiento.
- COMPLEMENTARIO: aunque parezcan similares, uno es introducción y el otro aplicación, o difieren en contexto/herramienta.

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
