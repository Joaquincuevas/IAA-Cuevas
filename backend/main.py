from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from jose import jwt, JWTError
from datetime import datetime, timedelta
import pandas as pd
import networkx as nx
from pathlib import Path
import os
import threading
from collections import defaultdict
from dotenv import load_dotenv
from matriz_parser import parse_todas_las_matrices, calcular_cobertura_por_semestre, generar_resumen_tributacion
import auth_db
import ai_db
import ai_engine

load_dotenv(Path(__file__).parent / ".env")

# ── Constants ──────────────────────────────────────────────────────────────────
_SECRET_KEY_DEFAULT = "trace-analytics-dev-secret-change-me"
SECRET_KEY = os.environ.get("SECRET_KEY", _SECRET_KEY_DEFAULT)
if SECRET_KEY == _SECRET_KEY_DEFAULT:
    import warnings
    warnings.warn(
        "SECRET_KEY is using the insecure default value. "
        "Set the SECRET_KEY environment variable before deploying to production.",
        stacklevel=1,
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

DATA_PATH = Path(os.environ.get("DATA_PATH", str(Path(__file__).parent.parent / "data" / "RA_UandesFunctional.xlsx")))
# Folder containing the Excel files (matrices + RA_Uandes)
DATA_FOLDER = DATA_PATH.parent

CARRERA_NAMES = {
    "IOC": "Civil",
    "ICI": "Industrial",
    "ING": "General",
    "ICE": "Eléctrica",
    "ICC": "Informática",
    "ICA": "Ambiental",
}

# ── Matrices cache ─────────────────────────────────────────────────────────────
_matrices_cache: dict | None = None

def get_matrices() -> dict:
    if _matrices_cache is None:
        raise HTTPException(status_code=503, detail="Matrices de tributación no cargadas")
    return _matrices_cache


@asynccontextmanager
async def lifespan(app_: FastAPI):
    global _matrices_cache
    auth_db.init_db()
    ai_db.init_ai_tables()
    n_orphans = ai_db.recover_orphan_jobs()
    if n_orphans:
        print(f"AI jobs huérfanos marcados como error: {n_orphans}")
    try:
        df_cursos, df_tributacion, df_competencias = parse_todas_las_matrices(DATA_FOLDER)
        _matrices_cache = {
            "cursos": df_cursos,
            "tributacion": df_tributacion,
            "competencias": df_competencias,
        }
        print(
            f"Matrices cargadas: {len(df_cursos)} cursos, {len(df_tributacion)} tributaciones"
        )
    except Exception as e:
        print(f"WARNING: No se pudieron cargar las matrices de tributación: {e}")
    yield


app = FastAPI(title="Trace Analytics API", version="0.5", lifespan=lifespan)

_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Data ───────────────────────────────────────────────────────────────────────
_data_cache = None

def get_data():
    global _data_cache
    if _data_cache is not None:
        return _data_cache

    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"No se encontró el Excel en {DATA_PATH}. Monta el archivo en /data/RA_UandesFunctional.xlsx o define DATA_PATH."
        )

    xl = pd.ExcelFile(DATA_PATH)

    general = xl.parse("general").dropna(subset=["ID"])
    general["ID"] = general["ID"].str.strip()
    general["Nombre"] = general["Nombre"].str.strip()
    general["Carrera"] = general["ID"].str.split("_").str[0]

    requirements = xl.parse("requirements").dropna(subset=["ID", "ID_Requisito"])
    requirements["ID"] = requirements["ID"].str.strip()
    requirements["ID_Requisito"] = requirements["ID_Requisito"].str.strip()

    objectives = xl.parse("objectives").dropna(subset=["ID", "ID_Objetivo"])
    objectives["ID"] = objectives["ID"].str.strip()
    objectives["ID_Objetivo"] = objectives["ID_Objetivo"].str.strip()
    objectives["Carrera"] = objectives["ID"].str.split("_").str[0]

    ra_links = xl.parse("RA_Links").dropna(subset=["ID", "ID_Objetivo", "ID_Prerrequisito"])
    ra_links["ID"] = ra_links["ID"].str.strip()
    ra_links["ID_Objetivo"] = ra_links["ID_Objetivo"].str.strip()
    ra_links["ID_Prerrequisito"] = ra_links["ID_Prerrequisito"].str.strip()
    ra_links["ID_Objetivo_Prerrequisito"] = ra_links["ID_Objetivo_Prerrequisito"].str.strip()
    ra_links["Importancia"] = ra_links["Importancia"].fillna("Baja").str.strip()

    _data_cache = {
        "general": general,
        "requirements": requirements,
        "objectives": objectives,
        "ra_links": ra_links,
    }
    return _data_cache

# ── Auth ───────────────────────────────────────────────────────────────────────
security = HTTPBearer()

class LoginRequest(BaseModel):
    email: str
    password: str

def create_token(email: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": email, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        return email
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = auth_db.verify_login(req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    return {
        "token": create_token(user["email"]),
        "user": auth_db.public_user(user),
    }


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@app.post("/api/auth/change-password")
def change_password(req: ChangePasswordRequest, email: str = Depends(verify_token)):
    ok, message = auth_db.change_password(email, req.old_password, req.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}


@app.get("/api/me")
def get_me(email: str = Depends(verify_token)):
    user = auth_db.get_user(email)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {
        **auth_db.public_user(user),
        "actividad": auth_db.activity_summary(email),
    }


@app.get("/api/history/chat")
def get_chat_history(email: str = Depends(verify_token)):
    return {"messages": auth_db.recent_chats(email)}


class FilterSnapshotRequest(BaseModel):
    label: str = ""
    filters: dict = {}


@app.post("/api/history/filters")
def save_filter_snapshot(req: FilterSnapshotRequest, email: str = Depends(verify_token)):
    auth_db.add_filter_snapshot(email, req.label, req.filters)
    return {"message": "Filtro guardado"}


@app.get("/api/history/filters")
def get_filter_history(email: str = Depends(verify_token)):
    return {"snapshots": auth_db.recent_filters(email)}

# ── Stats ──────────────────────────────────────────────────────────────────────
@app.get("/api/stats")
def get_stats(email: str = Depends(verify_token)):
    data = get_data()
    return {
        "cursos": len(data["general"]),
        "objetivos": len(data["objectives"]),
        "links": len(data["ra_links"]),
        "carreras": int(data["general"]["Carrera"].nunique()),
    }

# ── Conexiones ─────────────────────────────────────────────────────────────────
@app.get("/api/conexiones")
def get_conexiones(carrera: Optional[str] = None, email: str = Depends(verify_token)):
    data = get_data()
    general = data["general"]
    ra_links = data["ra_links"]

    G = nx.DiGraph()
    for _, row in general.iterrows():
        G.add_node(row["ID"], nombre=row["Nombre"], carrera=row["Carrera"])

    for _, row in ra_links.iterrows():
        src, dst = row["ID_Prerrequisito"], row["ID"]
        if src in G.nodes and dst in G.nodes:
            if G.has_edge(src, dst):
                G[src][dst]["total"] += 1
            else:
                G.add_edge(src, dst, total=1)

    rows = []
    for node, d in G.nodes(data=True):
        if carrera and d.get("carrera") != carrera:
            continue
        in_deg = G.in_degree(node)
        out_deg = G.out_degree(node)
        rows.append({
            "id": node,
            "nombre": d.get("nombre", ""),
            "carrera": d.get("carrera", ""),
            "carrera_nombre": CARRERA_NAMES.get(d.get("carrera", ""), d.get("carrera", "")),
            "recibe_de": in_deg,
            "alimenta_a": out_deg,
            "total_conexiones": in_deg + out_deg,
        })

    rows.sort(key=lambda x: x["total_conexiones"], reverse=True)

    # Stats are computed on the full filtered set (before pagination)
    filtered_nodes = [r["id"] for r in rows]
    sub_edges = sum(1 for u, v in G.edges() if u in filtered_nodes and v in filtered_nodes)
    hub_courses = sum(1 for r in rows if r["alimenta_a"] > 5)
    orphan_courses = sum(1 for r in rows if r["recibe_de"] == 0 and r["alimenta_a"] == 0)

    return {
        "cursos": rows,
        "stats": {
            "cursos_analizados": len(rows),
            "conexiones_totales": sub_edges,
            "cursos_hub": hub_courses,
            "cursos_huerfanos": orphan_courses,
            "promedio_por_curso": round(sub_edges / len(rows), 1) if rows else 0,
        },
    }

# ── Cobertura (matrices de tributación) ───────────────────────────────────────

CARRERAS_MATRICES = ["ICA", "ICC", "ICE", "IOC", "ICI"]


def _max_sem_para_carrera(df_cursos: pd.DataFrame, carrera: str) -> int:
    c = df_cursos[df_cursos["carrera"] == carrera]
    return int(c["semestre"].max()) if not c.empty else 10


@app.get("/api/cobertura/heatmap")
def get_heatmap(carrera: str, email: str = Depends(verify_token)):
    if carrera not in CARRERAS_MATRICES:
        raise HTTPException(status_code=400, detail=f"Carrera inválida. Opciones: {CARRERAS_MATRICES}")
    matrices = get_matrices()
    df_tributacion: pd.DataFrame = matrices["tributacion"]
    df_cursos: pd.DataFrame = matrices["cursos"]
    df_competencias: pd.DataFrame = matrices["competencias"]

    max_sem = _max_sem_para_carrera(df_cursos, carrera)
    df_cob = calcular_cobertura_por_semestre(df_tributacion, carrera, df_competencias, max_sem=max_sem)
    if df_cob.empty:
        raise HTTPException(status_code=404, detail=f"Sin datos para carrera {carrera}")

    competencias = []
    matriz = []
    competencias_debiles = []
    competencias_sin_cobertura = []
    competencias_baja_cobertura = []

    for _, row in df_cob.iterrows():
        comp_id = int(row["competencia_id"])
        pct = float(row["cobertura_pct"])
        label = f"PE{comp_id}"
        competencias.append({
            "id": comp_id,
            "texto_corto": row["competencia_texto_corto"],
            "texto_completo": row["competencia_texto"],
        })
        matriz.append([int(row[f"semestre_{s}"]) for s in range(1, max_sem + 1)])
        if pct < 40:
            competencias_debiles.append({
                "id": comp_id,
                "texto_corto": row["competencia_texto_corto"],
                "pct": pct,
            })
        if pct == 0:
            competencias_sin_cobertura.append(label)
        elif pct < 40:
            competencias_baja_cobertura.append({"pe": label, "cobertura": pct})

    cobertura_global = round(float(df_cob["cobertura_pct"].mean()), 1)
    total_cursos = int(df_cursos[df_cursos["carrera"] == carrera]["codigo"].nunique())

    # KPI1: % of PE competencias that have ≥1 nivel-c course (cobertura_pct > 0)
    n_covered = int((df_cob["cobertura_pct"] > 0).sum())
    kpi1_valor = round(n_covered / len(df_cob) * 100, 1) if len(df_cob) > 0 else 0.0

    return {
        "competencias": competencias,
        "semestres": list(range(1, max_sem + 1)),
        "matriz": matriz,
        "cobertura_global_pct": cobertura_global,
        "competencias_debiles": competencias_debiles,
        "total_cursos": total_cursos,
        "kpi1_valor": kpi1_valor,
        "competencias_sin_cobertura": competencias_sin_cobertura,
        "competencias_baja_cobertura": competencias_baja_cobertura,
    }


@app.get("/api/cobertura/comparacion")
def get_comparacion(email: str = Depends(verify_token)):
    matrices = get_matrices()
    df_tributacion: pd.DataFrame = matrices["tributacion"]
    df_cursos: pd.DataFrame = matrices["cursos"]
    df_competencias: pd.DataFrame = matrices["competencias"]

    result = {}
    for carrera in CARRERAS_MATRICES:
        max_sem = _max_sem_para_carrera(df_cursos, carrera)
        df_cob = calcular_cobertura_por_semestre(df_tributacion, carrera, df_competencias, max_sem=max_sem)
        result[carrera] = round(float(df_cob["cobertura_pct"].mean()), 1) if not df_cob.empty else 0.0
    return result


@app.get("/api/cobertura/tributaciones")
def get_tributaciones(carrera: str, email: str = Depends(verify_token)):
    """All PE competencias with their full course list for the detail view."""
    if carrera not in CARRERAS_MATRICES:
        raise HTTPException(status_code=400, detail=f"Carrera inválida. Opciones: {CARRERAS_MATRICES}")
    matrices = get_matrices()
    df_tributacion: pd.DataFrame = matrices["tributacion"]
    df_competencias: pd.DataFrame = matrices["competencias"]

    df_comp = (
        df_competencias[df_competencias["carrera"] == carrera]
        .drop_duplicates(subset=["competencia_id"])
        .sort_values("competencia_id")
    )
    df_trib = df_tributacion[df_tributacion["carrera"] == carrera]

    result = []
    for _, comp in df_comp.iterrows():
        comp_id = int(comp["competencia_id"])
        cursos_df = (
            df_trib[df_trib["competencia_id"] == comp_id][["codigo_curso", "nombre_curso", "semestre"]]
            .drop_duplicates()
            .sort_values("semestre")
        )
        result.append({
            "competencia_id": comp_id,
            "texto_corto": comp["texto_corto"],
            "texto_completo": comp["competencia_texto"],
            "cursos": cursos_df.to_dict(orient="records"),
        })

    return {"competencias": result}


@app.get("/api/cobertura/cursos")
def get_cursos_competencia(carrera: str, competencia_id: int, email: str = Depends(verify_token)):
    matrices = get_matrices()
    df_tributacion: pd.DataFrame = matrices["tributacion"]

    df = df_tributacion[
        (df_tributacion["carrera"] == carrera)
        & (df_tributacion["competencia_id"] == competencia_id)
    ]
    cursos = (
        df[["codigo_curso", "nombre_curso", "semestre"]]
        .drop_duplicates()
        .sort_values("semestre")
        .to_dict(orient="records")
    )
    return {"cursos": cursos}


@app.get("/api/objectives")
def get_objectives(email: str = Depends(verify_token)):
    """Devuelve la lista de objetivos con su descripción (columna 'Objetivo' si existe)."""
    data = get_data()
    objectives = data.get("objectives")
    rows = []
    cols = set(objectives.columns.tolist())
    for _, row in objectives.iterrows():
        # Coerce values to strings and guard against NaN/inf
        curso = ""
        id_obj = ""
        desc = ""
        try:
            if "ID" in cols and not pd.isna(row["ID"]):
                curso = str(row["ID"]).strip()
        except Exception:
            curso = ""
        try:
            if "ID_Objetivo" in cols and not pd.isna(row["ID_Objetivo"]):
                id_obj = str(row["ID_Objetivo"]).strip()
        except Exception:
            id_obj = ""
        try:
            if "Objetivo" in cols and not pd.isna(row["Objetivo"]):
                desc = str(row["Objetivo"]).strip()
        except Exception:
            desc = ""

        rows.append({
            "curso": curso,
            "id_objetivo": id_obj,
            "descripcion": desc,
        })
    # Use jsonable_encoder to convert numpy / pandas types safely
    return JSONResponse(content=jsonable_encoder({"objectives": rows}))


# ── Taula ──────────────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


def _compact_ra_summary(df_objectives: pd.DataFrame, df_ra_links: pd.DataFrame) -> str:
    """One line per course: CURSO (NOMBRE): RA1:A, RA2:M, RA3:B (A=Alta M=Media B=Baja)."""
    imp_order = {"Alta": 3, "Media": 2, "Baja": 1}
    if df_ra_links.empty:
        return ""
    max_imp = (
        df_ra_links.groupby("ID_Objetivo")["Importancia"]
        .apply(lambda x: max(x, key=lambda v: imp_order.get(v, 0)))
        .reset_index()
    )
    max_imp.columns = ["ID_Objetivo", "MaxImp"]
    merged = df_objectives[["ID", "ID_Objetivo", "Nombre"]].merge(max_imp, on="ID_Objetivo", how="left")
    merged["MaxImp"] = merged["MaxImp"].fillna("Baja")
    lines = []
    for curso_id, grp in merged.groupby("ID"):
        nombre = grp["Nombre"].iloc[0][:22]
        ras = ", ".join(
            f"{row['ID_Objetivo'].split('-')[-1]}:{row['MaxImp'][0]}"
            for _, row in grp.iterrows()
        )
        lines.append(f"{curso_id} ({nombre}): {ras}")
    return "\n".join(lines)


def build_taula_system_prompt(
    resumen_matrices: str,
    ra_summary: str,
    stats: dict,
) -> str:
    return f"""Eres Taula, el asistente de inteligencia curricular de la Facultad de Ingeniería de la Universidad de los Andes.

## Programas
IOC (Obras Civiles), ICI (Civil), ING (Industrial), ICE (Eléctrica), ICC (Computación), ICA (Ambiental).

## Estadísticas
{stats.get('n_cursos', 139)} cursos · {stats.get('n_objetivos', 672)} RAs · {stats.get('n_links', 925)} vínculos RA↔prerrequisito

## Importancia de los RAs en RA_Links
Alta = dominio pleno · Media = en desarrollo · Baja = introducción

## Cobertura real por carrera (PE cubiertos)
- ICA (Ambiental): 18/23 PEs con tributación directa
- ICC (Computación): 15/19 PEs
- ICE (Eléctrica): 17/21 PEs
- IOC (Obras Civiles): 22/29 PEs
- ICI (Civil): 17/21 PEs

## Reglas de análisis
- Cobertura PE: porcentaje de semestres con al menos 1 curso tributando al PE.
- Conexiones RA→PE: propuestas generadas por IA que deben ser validadas por usuarios.
- Redundancia: pares de objetivos semánticamente similares detectados por IA.
- Responde siempre en español, código de curso exacto (ej: ICA3102), conciso.

## Matrices de Tributación (curso → PEs que cubre)
{resumen_matrices if resumen_matrices else "No disponible."}

## RAs por curso (número:nivel)
{ra_summary if ra_summary else "No disponible."}
"""


@app.post("/api/taula/chat")
def chat(req: ChatRequest, email: str = Depends(verify_token)):
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

    data = get_data()
    resumen_tributacion = ""
    if _matrices_cache is not None:
        resumen_tributacion = generar_resumen_tributacion(_matrices_cache["tributacion"])

    ra_summary = _compact_ra_summary(data["objectives"], data["ra_links"])
    stats = {
        "n_cursos": len(data["general"]),
        "n_objetivos": len(data["objectives"]),
        "n_links": len(data["ra_links"]),
    }
    system_prompt = build_taula_system_prompt(
        resumen_matrices=resumen_tributacion,
        ra_summary=ra_summary,
        stats=stats,
    )

    try:
        from groq import Groq

        client = Groq(api_key=api_key)

        # Keep last 4 messages of history to stay within TPM limits
        trimmed_history = req.history[-4:] if len(req.history) > 4 else req.history
        messages: list[dict] = [{"role": "system", "content": system_prompt}]
        for msg in trimmed_history:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": req.message})

        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.3,
            max_tokens=1024,
        )
        reply = completion.choices[0].message.content
        # Persistir la conversación por usuario (historial)
        try:
            auth_db.add_chat(email, "user", req.message)
            auth_db.add_chat(email, "assistant", reply or "")
        except Exception:
            pass
        return {"reply": reply}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Dashboard summary ──────────────────────────────────────────────────────────
@app.get("/api/dashboard/summary")
def get_dashboard_summary(email: str = Depends(verify_token)):
    data = get_data()
    objectives = data["objectives"]
    ra_links = data["ra_links"]

    # ── KPI1 per carrera (from tributación matrices) ───────────────────────────
    por_carrera: dict = {c: {"kpi1": 0.0, "kpi2": 0.0} for c in CARRERA_NAMES}
    kpi1_global = 0.0

    if _matrices_cache is not None:
        df_tributacion: pd.DataFrame = _matrices_cache["tributacion"]
        df_cursos: pd.DataFrame = _matrices_cache["cursos"]
        df_competencias: pd.DataFrame = _matrices_cache["competencias"]

        kpi1_values: list[float] = []
        for carrera in CARRERAS_MATRICES:
            max_sem = _max_sem_para_carrera(df_cursos, carrera)
            df_cob = calcular_cobertura_por_semestre(df_tributacion, carrera, df_competencias, max_sem=max_sem)
            if not df_cob.empty:
                kpi1 = round(float((df_cob["cobertura_pct"] > 0).sum()) / len(df_cob) * 100, 1)
            else:
                kpi1 = 0.0
            por_carrera[carrera]["kpi1"] = kpi1
            kpi1_values.append(kpi1)

        kpi1_global = round(sum(kpi1_values) / len(kpi1_values), 1) if kpi1_values else 0.0

    # ── RA stats ──────────────────────────────────────────────────────────────
    all_obj_ids = set(objectives["ID_Objetivo"].tolist())
    total_ras = len(all_obj_ids)
    linked_objs = set(ra_links["ID_Objetivo"].tolist())
    ras_huerfanos = len(all_obj_ids - linked_objs)

    # ── AI stats from SQLite ──────────────────────────────────────────────────
    ai_stats = ai_db.get_ai_stats()

    n_competencias_sin_cobertura = 0
    if _matrices_cache is not None:
        df_tributacion = _matrices_cache["tributacion"]
        df_cursos = _matrices_cache["cursos"]
        df_competencias = _matrices_cache["competencias"]
        for carrera in CARRERAS_MATRICES:
            max_sem = _max_sem_para_carrera(df_cursos, carrera)
            df_cob = calcular_cobertura_por_semestre(df_tributacion, carrera, df_competencias, max_sem=max_sem)
            if not df_cob.empty:
                n_competencias_sin_cobertura += int((df_cob["cobertura_pct"] == 0).sum())

    return {
        "kpi1_global": kpi1_global,
        "n_cursos": len(data["general"]),
        "n_objetivos": total_ras,
        "n_links": len(ra_links),
        "n_carreras": len(CARRERA_NAMES),
        "ras_huerfanos": ras_huerfanos,
        "competencias_sin_cobertura": n_competencias_sin_cobertura,
        "por_carrera": por_carrera,
        "ai_stats": ai_stats,
    }


# ── AI Módulo: conexiones RA→PE y redundancia semántica ──────────────────────

class RecomputeRequest(BaseModel):
    job_type: str = "all"     # 'conexiones' | 'redundancia' | 'all'
    carrera: Optional[str] = None


class VoteRequest(BaseModel):
    target_type: str          # 'ra_pe' | 'redundancy'
    target_id: int
    voto: str                 # 'approve' | 'reject'
    comentario: Optional[str] = None


@app.post("/api/ai/recompute")
def recompute_ai(req: RecomputeRequest, email: str = Depends(verify_token)):
    """Inicia un job batch de análisis IA en background thread."""
    if req.job_type not in ("conexiones", "redundancia", "all"):
        raise HTTPException(status_code=400, detail="job_type debe ser 'conexiones', 'redundancia' o 'all'")

    carrera = req.carrera.upper().strip() if req.carrera else None
    if carrera and carrera not in CARRERAS_MATRICES:
        raise HTTPException(status_code=400, detail=f"Carrera inválida. Opciones: {CARRERAS_MATRICES}")

    # Check if a job is already running
    running = ai_db.get_running_jobs()
    if running:
        return {"message": "Ya hay un job en curso", "job_id": running[0]["id"], "already_running": True}

    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY no configurada")

    # Compute Excel hash for cache invalidation
    excel_paths = [DATA_PATH] + [
        DATA_FOLDER / fname
        for fname in [
            "Matriz Tributación PE 2022 AMBIENTAL.xlsx",
            "Matriz Tributación PE 2022 COMPUTACION.xlsx",
            "Matriz Tributación PE 2022 ELECTRICA.xlsx",
            "Matriz Tributación PE 2022 OBRAS CIVILES.xlsx",
            "Matriz Tributación PE 2023 INDUSTRIAL.xlsx",
        ]
    ]
    new_hash = ai_engine.excel_hash([p for p in excel_paths if p.exists()])

    job_id = ai_db.create_job(req.job_type, carrera, new_hash)

    data = get_data()
    matrices = get_matrices()

    t = threading.Thread(
        target=ai_engine.run_job,
        args=(job_id, req.job_type, carrera, groq_key, data, matrices),
        daemon=True,
    )
    t.start()

    return {"job_id": job_id, "status": "running", "message": f"Job {req.job_type} iniciado"}


@app.get("/api/ai/jobs/latest")
def get_latest_jobs(email: str = Depends(verify_token)):
    """Último job completado por tipo."""
    return {
        "conexiones": ai_db.get_latest_job("conexiones") or ai_db.get_latest_job("all"),
        "redundancia": ai_db.get_latest_job("redundancia") or ai_db.get_latest_job("all"),
        "running": ai_db.get_running_jobs(),
    }


@app.get("/api/ai/jobs/current")
def get_current_ai_job(email: str = Depends(verify_token)):
    """Job activo (si hay uno en curso)."""
    job = ai_db.get_current_job()
    if not job:
        raise HTTPException(status_code=404, detail="No hay análisis en curso")
    return job


@app.post("/api/ai/cancel")
def cancel_ai_job(email: str = Depends(verify_token)):
    """Cancela el análisis en curso."""
    job = ai_db.cancel_current_job()
    if not job:
        raise HTTPException(status_code=404, detail="No hay análisis en curso para cancelar")
    return {"message": "Análisis cancelado", "job": job}


@app.get("/api/ai/jobs/{job_id}")
def get_job_status(job_id: int, email: str = Depends(verify_token)):
    job = ai_db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return job


@app.get("/api/ai/conexiones")
def get_ai_conexiones(
    carrera: Optional[str] = None,
    status: Optional[str] = None,
    curso: Optional[str] = None,
    pe: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    email: str = Depends(verify_token),
):
    """Lista paginada de propuestas RA→PE con filtros."""
    proposals = ai_db.get_ra_pe_proposals(
        carrera=carrera.upper() if carrera else None,
        status=status,
        curso=curso,
        pe=pe,
        limit=limit,
        offset=offset,
    )
    total = ai_db.count_ra_pe_proposals(
        carrera=carrera.upper() if carrera else None,
        status=status,
    )
    return JSONResponse(content=jsonable_encoder({
        "proposals": proposals,
        "total": total,
        "limit": limit,
        "offset": offset,
    }))


@app.get("/api/ai/redundancia")
def get_ai_redundancia(
    carrera: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    email: str = Depends(verify_token),
):
    """Lista paginada de pares redundantes semánticos."""
    proposals = ai_db.get_redundancy_proposals(
        carrera=carrera.upper() if carrera else None,
        status=status,
        limit=limit,
        offset=offset,
    )
    return JSONResponse(content=jsonable_encoder({
        "proposals": proposals,
        "total": len(proposals),
        "limit": limit,
        "offset": offset,
    }))


@app.post("/api/ai/votes")
def cast_vote(req: VoteRequest, email: str = Depends(verify_token)):
    """Emite un voto sobre una propuesta RA→PE o de redundancia."""
    if req.target_type not in ("ra_pe", "redundancy"):
        raise HTTPException(status_code=400, detail="target_type debe ser 'ra_pe' o 'redundancy'")
    if req.voto not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="voto debe ser 'approve' o 'reject'")
    updated = ai_db.cast_vote(email, req.target_type, req.target_id, req.voto, req.comentario)
    if not updated:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    return JSONResponse(content=jsonable_encoder({"proposal": updated}))


@app.get("/api/ai/stats")
def get_ai_stats_endpoint(carrera: Optional[str] = None, email: str = Depends(verify_token)):
    """KPIs del módulo IA: pendientes, aprobadas, rechazadas."""
    return ai_db.get_ai_stats(carrera=carrera.upper() if carrera else None)


@app.post("/api/ai/clear-all")
def clear_all_ai(email: str = Depends(verify_token)):
    """Elimina todas las propuestas IA, votos e historial de jobs (no toca Excel ni usuarios)."""
    if ai_db.get_running_jobs():
        raise HTTPException(
            status_code=409,
            detail="Hay un análisis en curso. Cancélalo antes de eliminar los resultados.",
        )
    deleted = ai_db.clear_all_ai_results()
    return {
        "message": "Resultados IA eliminados",
        "deleted": deleted,
    }


@app.get("/api/ai/export/conexiones")
def export_conexiones(carrera: Optional[str] = None, email: str = Depends(verify_token)):
    """Devuelve propuestas aprobadas para exportar."""
    approved = ai_db.get_approved_ra_pe(carrera=carrera.upper() if carrera else None)
    return JSONResponse(content=jsonable_encoder({"conexiones": approved, "total": len(approved)}))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
