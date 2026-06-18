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
from collections import defaultdict
from dotenv import load_dotenv
from matriz_parser import parse_todas_las_matrices, calcular_cobertura_por_semestre, generar_resumen_tributacion
import auth_db

load_dotenv(Path(__file__).parent / ".env")

# ── Constants ──────────────────────────────────────────────────────────────────
# La clave de firma de JWT se toma del entorno; el valor por defecto es solo para
# desarrollo local. En producción definir SECRET_KEY como variable de entorno.
SECRET_KEY = os.environ.get("SECRET_KEY", "trace-analytics-dev-secret-change-me")
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

# ── Helpers ───────────────────────────────────────────────────────────────────
def _course_to_semester(course_id: str) -> int:
    """Derive academic semester (1-10) from a course ID like 'ICA_3102'."""
    try:
        num = course_id.split("_")[1]
        year = int(num[0])
        units = int(num[-1])
        half = 1 if units % 2 == 1 else 2
        sem = (year - 1) * 2 + half
        return min(max(sem, 1), 10)
    except Exception:
        return 1

def _importancia_to_nivel(importancia: str) -> str:
    """Map Importancia label to nivel letter: Alta→c, Media→b, Baja→a."""
    return {"alta": "c", "media": "b", "baja": "a"}.get(
        str(importancia).strip().lower(), "a"
    )

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


# ── Redundancia ────────────────────────────────────────────────────────────────
_NIVEL_ORDER = {"a": 1, "b": 2, "c": 3}

@app.get("/api/redundancia")
def get_redundancia(email: str = Depends(verify_token)):
    data = get_data()
    objectives = data["objectives"]
    ra_links = data["ra_links"]

    all_obj_ids = set(objectives["ID_Objetivo"].tolist())

    # Description lookup for objectives
    obj_to_desc: dict = {}
    for _, row in objectives.iterrows():
        oid = str(row["ID_Objetivo"]).strip()
        desc = str(row["Objetivo"]).strip() if pd.notna(row.get("Objetivo", float("nan"))) else ""
        obj_to_desc[oid] = desc

    # Build per-RA sequence: ra_id → {course_id: best_nivel}
    # Deduplicate (course, nivel) per RA by keeping the highest nivel per course
    ra_best: dict[str, dict[str, str]] = defaultdict(dict)

    for _, row in ra_links.iterrows():
        ra_id = str(row["ID_Objetivo_Prerrequisito"]).strip()
        course_id = str(row["ID"]).strip()
        nivel = _importancia_to_nivel(str(row.get("Importancia", "Baja")))
        existing = ra_best[ra_id].get(course_id)
        if existing is None or _NIVEL_ORDER.get(nivel, 0) > _NIVEL_ORDER.get(existing, 0):
            ra_best[ra_id][course_id] = nivel

    # Detect stagnation: a level L is stagnant if ≥3 courses require this RA at level L
    # and no course requires it at a higher level
    detalle: list[dict] = []
    for ra_id, course_nivel_map in ra_best.items():
        entries = [
            (cid, niv, _course_to_semester(cid))
            for cid, niv in course_nivel_map.items()
        ]
        entries.sort(key=lambda x: x[2])  # sort by semestre

        max_nivel_val = max((_NIVEL_ORDER.get(e[1], 0) for e in entries), default=0)

        for nivel_check in ("a", "b", "c"):
            nivel_val = _NIVEL_ORDER[nivel_check]
            at_this_level = [(cid, sem) for cid, niv, sem in entries if niv == nivel_check]
            if len(at_this_level) >= 3 and max_nivel_val <= nivel_val:
                severidad = "alta" if len(at_this_level) >= 5 else "media"
                detalle.append({
                    "id_objetivo": ra_id,
                    "descripcion": obj_to_desc.get(ra_id, ""),
                    "nivel_repetido": nivel_check,
                    "cursos": [c[0] for c in at_this_level],
                    "semestres": [c[1] for c in at_this_level],
                    "severidad": severidad,
                    "cursos_demandantes": len(at_this_level),
                    "cursos_lista": [c[0] for c in at_this_level],
                })
                break  # report only the lowest stagnant level per RA

    detalle.sort(key=lambda x: x["cursos_demandantes"], reverse=True)

    # Orphans: objectives not referenced as a goal (ID_Objetivo) in any link
    linked_objs = set(ra_links["ID_Objetivo"].tolist())
    orphan_ids = sorted(all_obj_ids - linked_objs)
    orphan_list = [
        {"id_objetivo": oid, "descripcion": obj_to_desc.get(oid, "")}
        for oid in orphan_ids
    ]

    total_ras = len(all_obj_ids)
    redundant_count = len(detalle)
    redundancy_pct = round(redundant_count / total_ras * 100, 1) if total_ras > 0 else 0.0

    # Build overcovered list compatible with frontend field names
    overcovered_list = [
        {
            "id_objetivo": item["id_objetivo"],
            "descripcion": item["descripcion"],
            "cursos_demandantes": item["cursos_demandantes"],
            "cursos_lista": item["cursos_lista"],
        }
        for item in detalle
    ]

    return {
        "kpi": {
            "tasa_redundancia_pct": redundancy_pct,
            "total_ras": total_ras,
            "ras_sobre_cubiertos": redundant_count,
            "ras_huerfanos": len(orphan_ids),
        },
        "overcovered": overcovered_list,
        "orphans": orphan_list,
        "detalle": detalle,
    }


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


@app.get("/api/objectives_public")
def get_objectives_public():
    """Endpoint público (solo para desarrollo) que devuelve objetivos con descripción sin requerir autenticación."""
    data = get_data()
    objectives = data.get("objectives")
    rows = []
    cols = set(objectives.columns.tolist())
    for _, row in objectives.iterrows():
        rows.append({
            "curso": row["ID"] if "ID" in cols else "",
            "id_objetivo": row["ID_Objetivo"] if "ID_Objetivo" in cols else "",
            "descripcion": row["Objetivo"] if "Objetivo" in cols else "",
        })
    return {"objectives": rows}


# ── Trazabilidad RA → PE ───────────────────────────────────────────────────────
@app.get("/api/trazabilidad")
def get_trazabilidad(carrera: Optional[str] = None, email: str = Depends(verify_token)):
    data = get_data()
    df_obj = data["objectives"]   # ID, ID_Objetivo, Nombre, Objetivo, Carrera
    df_links = data["ra_links"]   # ID, ID_Objetivo, Importancia, ...
    matrices = get_matrices()
    df_tributacion: pd.DataFrame = matrices["tributacion"]
    df_competencias: pd.DataFrame = matrices["competencias"]

    carrera_filter = carrera.upper().strip() if carrera else None
    if carrera_filter and carrera_filter not in CARRERAS_MATRICES:
        raise HTTPException(status_code=400, detail=f"Carrera inválida. Opciones: {CARRERAS_MATRICES}")

    # Paso 1: max Importancia per RA (ID_Objetivo) from RA_Links
    _imp_ord = {"Alta": 3, "Media": 2, "Baja": 1}
    ra_nivel: dict[str, str] = {}
    for _, row in df_links.iterrows():
        ra_id = str(row["ID_Objetivo"]).strip()
        imp = str(row.get("Importancia", "Baja")).strip()
        if imp not in _imp_ord:
            imp = "Baja"
        if ra_id not in ra_nivel or _imp_ord[imp] > _imp_ord[ra_nivel[ra_id]]:
            ra_nivel[ra_id] = imp

    # Paso 2: course_pe_map[carrera][curso_norm] = sorted list of PE labels
    # df_tributacion.codigo_curso has no underscore (ICA3102)
    course_pe_map: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for _, row in df_tributacion.iterrows():
        car = str(row["carrera"]).strip()
        curso = str(row["codigo_curso"]).strip()
        pe_label = f"PE{int(row['competencia_id'])}"
        if pe_label not in course_pe_map[car][curso]:
            course_pe_map[car][curso].append(pe_label)

    # Paso 3: PE descriptions and ordered labels per carrera
    pe_desc: dict[str, dict[str, str]] = defaultdict(dict)
    for _, row in df_competencias.iterrows():
        car = str(row["carrera"]).strip()
        pe_label = f"PE{int(row['competencia_id'])}"
        pe_desc[car][pe_label] = str(row["competencia_texto"]).strip()

    def _pe_sort_key(label: str) -> int:
        try:
            return int(label[2:])
        except ValueError:
            return 999

    # Paso 4: cross objectives × matrices × nivel
    mappings: list[dict] = []
    for _, row in df_obj.iterrows():
        curso_id = str(row["ID"]).strip()         # ICA_3102
        ra_id = str(row["ID_Objetivo"]).strip()   # ICA_3102-1
        ra_texto = str(row.get("Objetivo", "")).strip()
        curso_nombre = str(row.get("Nombre", "")).strip()
        ra_carrera = curso_id[:3]

        if carrera_filter and ra_carrera != carrera_filter:
            if not curso_id.startswith("ING"):
                continue

        # Normalize: ICA_3102 → ICA3102
        curso_norm = curso_id.replace("_", "", 1)

        pe_list = list(course_pe_map[ra_carrera].get(curso_norm, []))
        # ING courses: also search in filtered carrera's matrix
        if not pe_list and carrera_filter and curso_id.startswith("ING"):
            pe_list = list(course_pe_map[carrera_filter].get(curso_norm, []))

        pe_list = sorted(pe_list, key=_pe_sort_key)
        nivel = ra_nivel.get(ra_id, "Baja")

        mappings.append({
            "ra_id": ra_id,
            "ra_texto": ra_texto[:120],
            "ra_texto_completo": ra_texto,
            "curso_id": curso_id,
            "curso_nombre": curso_nombre,
            "carrera": ra_carrera,
            "nivel": nivel,
            "pe_list": pe_list,
        })

    # Paso 5: PE summary per carrera
    carreras_to_summarize = [carrera_filter] if carrera_filter else CARRERAS_MATRICES
    pe_summary: dict[str, dict[str, dict]] = {}
    for car in carreras_to_summarize:
        pe_summary[car] = {}
        all_pes = sorted(pe_desc.get(car, {}).keys(), key=_pe_sort_key)
        for pe_label in all_pes:
            car_mappings = [
                m for m in mappings
                if pe_label in m["pe_list"] and (m["carrera"] == car or (
                    carrera_filter and m["curso_id"].startswith("ING")
                ))
            ]
            alta = sum(1 for m in car_mappings if m["nivel"] == "Alta")
            media = sum(1 for m in car_mappings if m["nivel"] == "Media")
            baja = sum(1 for m in car_mappings if m["nivel"] == "Baja")
            pe_summary[car][pe_label] = {
                "alta": alta,
                "media": media,
                "baja": baja,
                "cubierta": alta > 0,
                "descripcion": pe_desc.get(car, {}).get(pe_label, ""),
            }

    return JSONResponse(content=jsonable_encoder({
        "mappings": mappings,
        "pe_summary": pe_summary,
        "total_mappings": len(mappings),
        "carreras_disponibles": CARRERAS_MATRICES,
        "carrera_filtrada": carrera_filter,
    }))


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

## Niveles de tributación
A=Alta (dominio pleno, cuenta para cobertura PE) · M=Media (desarrollo) · B=Baja (introducción)

## Cobertura real por carrera
- ICA (Ambiental): 78.3% — 18/23 PEs con nivel Alta
- ICC (Computación): 78.9% — 15/19 PEs con nivel Alta
- ICE (Eléctrica): 81.0% — 17/21 PEs con nivel Alta
- IOC (Obras Civiles): 75.9% — 22/29 PEs con nivel Alta
- ICI (Civil): 81.0% — 17/21 PEs con nivel Alta
PE1–PE4 sin cobertura Alta en todas las carreras (competencias transversales humanísticas — esperado).

## Reglas de análisis
- Redundancia: RA en ≥3 cursos con el MISMO nivel sin progresión. Progresión B→M→A es deseable.
- Cobertura PE: solo cuentan RAs de nivel Alta. Media y Baja son formación previa.
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

    # ── KPI2 per carrera (from ra_links Importancia levels) ────────────────────
    all_obj_ids = set(objectives["ID_Objetivo"].tolist())
    total_ras = len(all_obj_ids)
    linked_objs = set(ra_links["ID_Objetivo"].tolist())
    ras_huerfanos = len(all_obj_ids - linked_objs)

    # Build per-RA best nivel per course (same logic as get_redundancia)
    ra_best: dict[str, dict[str, str]] = defaultdict(dict)
    for _, row in ra_links.iterrows():
        ra_id = str(row["ID_Objetivo_Prerrequisito"]).strip()
        course_id = str(row["ID"]).strip()
        nivel = _importancia_to_nivel(str(row.get("Importancia", "Baja")))
        existing = ra_best[ra_id].get(course_id)
        if existing is None or _NIVEL_ORDER.get(nivel, 0) > _NIVEL_ORDER.get(existing, 0):
            ra_best[ra_id][course_id] = nivel

    # Detect stagnant RAs and tag by carrera
    carrera_redundant: dict[str, int] = defaultdict(int)
    total_redundant = 0

    for ra_id, course_nivel_map in ra_best.items():
        entries = [
            (cid, niv, _course_to_semester(cid))
            for cid, niv in course_nivel_map.items()
        ]
        max_nivel_val = max((_NIVEL_ORDER.get(e[1], 0) for e in entries), default=0)
        for nivel_check in ("a", "b", "c"):
            at_level = [e for e in entries if e[1] == nivel_check]
            if len(at_level) >= 3 and max_nivel_val <= _NIVEL_ORDER[nivel_check]:
                total_redundant += 1
                # Tag by carrera of the RA id (format: "CAR_XXXX-N")
                carrera_tag = ra_id.split("_")[0] if "_" in ra_id else ""
                if carrera_tag in por_carrera:
                    carrera_redundant[carrera_tag] += 1
                break

    kpi2_global = round(total_redundant / total_ras * 100, 1) if total_ras > 0 else 0.0

    for carrera in CARRERA_NAMES:
        n = carrera_redundant.get(carrera, 0)
        # Count RAs belonging to this carrera
        n_ra_carrera = sum(
            1 for oid in all_obj_ids
            if oid.split("_")[0] == carrera
        )
        por_carrera[carrera]["kpi2"] = (
            round(n / n_ra_carrera * 100, 1) if n_ra_carrera > 0 else 0.0
        )

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
        "kpi2_global": kpi2_global,
        "n_cursos": len(data["general"]),
        "n_objetivos": total_ras,
        "n_links": len(ra_links),
        "n_carreras": len(CARRERA_NAMES),
        "ras_huerfanos": ras_huerfanos,
        "ras_sobrecubiertos": total_redundant,
        "competencias_sin_cobertura": n_competencias_sin_cobertura,
        "por_carrera": por_carrera,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
