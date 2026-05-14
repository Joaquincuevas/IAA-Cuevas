from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from jose import jwt, JWTError
from datetime import datetime, timedelta
import pandas as pd
import networkx as nx
from pathlib import Path
import os
import itertools
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# ── Constants ──────────────────────────────────────────────────────────────────
SECRET_KEY = "trace-analytics-secret-2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

DATA_PATH = Path(__file__).parent.parent / "data" / "RA_UandesFunctional.xlsx"

USERS = {
    "jjcuevas@miuandes.cl": {"password": "admin123", "name": "J. Cuevas", "role": "admin"},
    "vcuevas@miuandes.cl":  {"password": "admin123", "name": "V. Cuevas", "role": "admin"},
}

CARRERA_NAMES = {
    "IOC": "Civil",
    "ICI": "Industrial",
    "ING": "General",
    "ICE": "Eléctrica",
    "ICC": "Informática",
    "ICA": "Ambiental",
}

PE_DOMAINS = [
    {"code": "PE1", "name": "Análisis y modelado",   "description": "Resolver problemas mediante modelado analítico."},
    {"code": "PE2", "name": "Diseño de soluciones",  "description": "Diseñar soluciones de ingeniería integrales."},
    {"code": "PE3", "name": "Comunicación",           "description": "Comunicar técnica y profesionalmente, oral y escrito."},
    {"code": "PE4", "name": "Trabajo en equipo",      "description": "Colaborar efectivamente en equipos multidisciplinarios."},
    {"code": "PE5", "name": "Ética profesional",      "description": "Actuar con responsabilidad y ética profesional."},
    {"code": "PE6", "name": "Pensamiento crítico",    "description": "Evaluar y generar conocimiento de forma sistemática."},
]

app = FastAPI(title="Trace Analytics API", version="0.4")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
    user = USERS.get(req.email.strip())
    if not user or user["password"] != req.password:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    return {
        "token": create_token(req.email.strip()),
        "user": {"email": req.email.strip(), "name": user["name"], "role": user["role"]},
    }

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

    filtered_nodes = [r["id"] for r in rows]
    sub_edges = sum(
        1 for u, v in G.edges()
        if u in filtered_nodes and v in filtered_nodes
    )
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

# ── Cobertura ──────────────────────────────────────────────────────────────────
def _course_to_semester(course_id: str) -> int:
    try:
        num = course_id.split("_")[1]
        year = int(num[0])             # 1-5 → academic year
        units = int(num[-1])           # last digit → within-year ordering
        half = 1 if units % 2 == 1 else 2
        sem = (year - 1) * 2 + half
        return min(max(sem, 1), 10)
    except Exception:
        return 1

def _obj_to_pe(obj_id: str) -> int:
    return (hash(obj_id) % 6) + 1

@app.get("/api/cobertura")
def get_cobertura(carrera: Optional[str] = None, email: str = Depends(verify_token)):
    data = get_data()
    objectives = data["objectives"]
    ra_links = data["ra_links"]

    if carrera:
        objs = objectives[objectives["Carrera"] == carrera].copy()
    else:
        objs = objectives.copy()

    alta_links = ra_links[ra_links["Importancia"] == "Alta"]
    covered = set(alta_links["ID_Objetivo_Prerrequisito"].unique())

    objs = objs.copy()
    objs["semestre"] = objs["ID"].apply(_course_to_semester)
    objs["pe_domain"] = objs["ID_Objetivo"].apply(_obj_to_pe)
    objs["covered"] = objs["ID_Objetivo"].isin(covered)

    heatmap = []
    for pe in range(1, 7):
        for sem in range(1, 11):
            cell = objs[(objs["pe_domain"] == pe) & (objs["semestre"] == sem)]
            if len(cell) == 0:
                nivel = 0
            else:
                ratio = cell["covered"].sum() / len(cell)
                nivel = min(5, max(1, round(ratio * 5))) if ratio > 0 else 0
            heatmap.append({"pe": f"PE{pe}", "semestre": f"S{sem}", "nivel": nivel})

    domain_coverage = []
    for idx, domain in enumerate(PE_DOMAINS, 1):
        pe_objs = objs[objs["pe_domain"] == idx]
        pct = round(pe_objs["covered"].sum() / len(pe_objs) * 100) if len(pe_objs) > 0 else 0
        domain_coverage.append({**domain, "cobertura": pct})

    overall = round(objs["covered"].sum() / len(objs) * 100) if len(objs) > 0 else 0
    weak = sum(1 for d in domain_coverage if d["cobertura"] < 70)

    return {
        "stats": {
            "cobertura_global": overall,
            "dominios": len(PE_DOMAINS),
            "dominios_debiles": weak,
            "ciclos": 10,
        },
        "heatmap": heatmap,
        "domains": domain_coverage,
        "carreras": list(CARRERA_NAMES.keys()),
    }

# ── Redundancia ────────────────────────────────────────────────────────────────
@app.get("/api/redundancia")
def get_redundancia(email: str = Depends(verify_token)):
    data = get_data()
    objectives = data["objectives"]
    ra_links = data["ra_links"]
    general = data["general"]

    id_to_nombre = general.set_index("ID")["Nombre"].to_dict()
    obj_to_course = objectives.set_index("ID_Objetivo")["ID"].to_dict()

    link_courses = ra_links[["ID_Objetivo_Prerrequisito", "ID"]].drop_duplicates()
    counts = link_courses.groupby("ID_Objetivo_Prerrequisito")["ID"].apply(set).reset_index()
    counts.columns = ["obj_id", "course_set"]
    counts = counts[counts["course_set"].apply(len) >= 3].copy()

    all_obj_ids = set(objectives["ID_Objetivo"].tolist())
    linked_objs = set(ra_links["ID_Objetivo"].tolist())
    orphans_count = len(all_obj_ids - linked_objs)
    overcovered_count = len(counts)

    clusters = []
    if not counts.empty:
        obj_ids = counts["obj_id"].tolist()
        course_sets = {row["obj_id"]: row["course_set"] for _, row in counts.iterrows()}

        sim_graph = nx.Graph()
        sim_graph.add_nodes_from(obj_ids)

        for a, b in itertools.combinations(obj_ids, 2):
            sa, sb = course_sets[a], course_sets[b]
            union = len(sa | sb)
            if union > 0:
                jaccard = len(sa & sb) / union
                if jaccard >= 0.3:
                    sim_graph.add_edge(a, b, weight=jaccard)

        for i, component in enumerate(nx.connected_components(sim_graph)):
            if len(component) < 2:
                continue
            comp_objs = list(component)
            comp_courses: set = set()
            for obj in comp_objs:
                comp_courses |= course_sets.get(obj, set())

            overlaps = []
            for a, b in itertools.combinations(comp_objs, 2):
                sa, sb = course_sets.get(a, set()), course_sets.get(b, set())
                union = len(sa | sb)
                if union > 0:
                    overlaps.append(len(sa & sb) / union)
            avg_overlap = round(sum(overlaps) / len(overlaps) * 100) if overlaps else 0

            if avg_overlap >= 65:
                severidad = "Alta"
            elif avg_overlap >= 45:
                severidad = "Media"
            else:
                severidad = "Baja"

            main_obj = max(comp_objs, key=lambda o: len(course_sets.get(o, set())))
            course_id = obj_to_course.get(main_obj, "")
            cluster_name = id_to_nombre.get(course_id, main_obj)

            course_tags = [
                {"id": c, "nombre": id_to_nombre.get(c, c)}
                for c in sorted(list(comp_courses))[:3]
            ]

            clusters.append({
                "id": f"CLUSTER {i + 1:02d}",
                "nombre": cluster_name,
                "severidad": severidad,
                "overlap": avg_overlap,
                "cursos": course_tags,
                "total_objetivos": len(comp_objs),
                "total_cursos": len(comp_courses),
            })

        clusters.sort(key=lambda x: x["overlap"], reverse=True)

    return {
        "clusters": clusters[:5],
        "stats": {
            "clusters_detectados": len(clusters),
            "horas_duplicadas": overcovered_count * 2,
            "ras_huerfanos": orphans_count,
            "ras_sobre_cubiertos": overcovered_count,
        },
    }

# ── Taula ──────────────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []

@app.post("/api/taula/chat")
def chat(req: ChatRequest, email: str = Depends(verify_token)):
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    data = get_data()
    system_prompt = (
        "Eres Taula, asistente de inteligencia artificial de Trace Analytics, "
        "desarrollado para el Area Curricular de la Facultad de Ingenieria y Ciencias "
        "Aplicadas de la Universidad de los Andes (Chile).\n\n"
        "Tu proposito es ayudar a analizar la malla curricular, identificar brechas, "
        "redundancias, cursos criticos y responder preguntas sobre como los Resultados "
        "de Aprendizaje (RAs) se conectan entre cursos y contribuyen al perfil de egreso.\n\n"
        "DATOS COMPLETOS DE LA MALLA:\n\n"
        "=== CURSOS ===\n"
        + data["general"].to_string(index=False)
        + "\n\n=== PRERREQUISITOS ===\n"
        + data["requirements"].to_string(index=False)
        + "\n\n=== OBJETIVOS DE APRENDIZAJE ===\n"
        + data["objectives"].to_string(index=False)
        + "\n\n=== LINKS ENTRE OBJETIVOS ===\n"
        + data["ra_links"].to_string(index=False)
        + "\n\nCARRERAS:\n"
        "- IOC: Ingenieria Civil en Obras Civiles\n"
        "- ICI: Ingenieria Civil Industrial\n"
        "- ING: Ingenieria General\n"
        "- ICE: Ingenieria Civil Electrica\n"
        "- ICC: Ingenieria Civil en Computacion\n"
        "- ICA: Ingenieria Civil Ambiental\n\n"
        "Responde siempre en espanol. Se analitico, preciso y util. "
        "Cuando menciones cursos, incluye su ID y nombre completo."
    )

    try:
        from google import genai
        from google.genai import types as genai_types

        client = genai.Client(api_key=api_key)

        history = [
            genai_types.Content(
                role=msg.role,
                parts=[genai_types.Part(text=msg.content)],
            )
            for msg in req.history
        ]

        chat_session = client.chats.create(
            model="gemini-2.0-flash",
            config=genai_types.GenerateContentConfig(system_instruction=system_prompt),
            history=history,
        )
        response = chat_session.send_message(req.message)
        return {"reply": response.text}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
