import streamlit as st
import sys
import pandas as pd
import networkx as nx
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

st.set_page_config(page_title="Conexiones — Trace Analytics", layout="wide", initial_sidebar_state="expanded")

from src.styles import apply_styles, render_sidebar_logo, render_sidebar_nav, render_sidebar_user
from src.auth import require_auth
from src.data_loader import load_data, CARRERA_NAMES
from src.graph_builder import build_course_graph
from src.visualizer import build_adjacency_bar_chart

apply_styles()

if not require_auth():
    st.stop()

email = st.session_state["user_email"]

render_sidebar_logo()
render_sidebar_nav()

with st.sidebar:
    st.markdown("---")
    carrera_opts = ["Todas"] + sorted(CARRERA_NAMES.keys())
    selected_code = st.selectbox(
        "Filtrar por carrera",
        options=carrera_opts,
        format_func=lambda x: "Todas las carreras" if x == "Todas" else str(CARRERA_NAMES.get(x) or x),
    )
    importance_filter = st.multiselect(
        "Importancia de links",
        options=["Alta", "Media", "Baja"],
        default=["Alta", "Media", "Baja"],
    )

render_sidebar_user(email)

# ── Contenido ──────────────────────────────────────────────────────────────────
st.markdown(
    "<h2 style='font-size:22px; font-weight:700; color:#111827; margin-bottom:4px;'>"
    "Conexiones Curriculares</h2>",
    unsafe_allow_html=True,
)
st.markdown(
    "<p style='color:#6B7280; font-size:14px; margin-top:-4px;'>"
    "Tabla de adyacencia por curso — grado de entrada, salida y peso de conexión.</p>",
    unsafe_allow_html=True,
)

data     = load_data()
general  = data["general"]
ra_links = data["ra_links"]

ra_filtered = ra_links[ra_links["Importancia"].isin(importance_filter)]
G = build_course_graph(general, ra_filtered)

subG_nodes = [n for n, d in G.nodes(data=True)
              if selected_code == "Todas" or d.get("carrera") == selected_code]
subG = G.subgraph(subG_nodes)

c1, c2, c3, c4 = st.columns(4)
with c1:
    st.metric("Cursos (nodos)", subG.number_of_nodes())
with c2:
    st.metric("Conexiones (aristas)", subG.number_of_edges())
with c3:
    alta_edges = sum(1 for _, _, d in G.edges(data=True) if d.get("importancia") == "Alta")
    st.metric("Links Alta importancia", alta_edges)
with c4:
    density = nx.density(subG) if subG.number_of_nodes() > 0 else 0
    st.metric("Densidad del grafo", f"{density:.3f}")

st.markdown("---")

# ── Tabla de adyacencia ────────────────────────────────────────────────────────
rows = []
for node, d in subG.nodes(data=True):
    in_deg  = subG.in_degree(node)   # type: ignore[union-attr]
    out_deg = subG.out_degree(node)  # type: ignore[union-attr]
    rows.append({
        "ID": node,
        "Nombre": d.get("nombre", ""),
        "Carrera": d.get("carrera_nombre", ""),
        "Recibe de (in)": in_deg,
        "Alimenta a (out)": out_deg,
        "Total conexiones": in_deg + out_deg,
    })
df_adj = pd.DataFrame(rows).sort_values("Total conexiones", ascending=False)

col_search, _ = st.columns([2, 3])
with col_search:
    search = st.text_input(
        "Buscar curso",
        placeholder="Nombre o código…",
        label_visibility="visible",
    )

if search:
    mask = (
        df_adj["ID"].str.contains(search, case=False, na=False)
        | df_adj["Nombre"].str.contains(search, case=False, na=False)
    )
    df_show = df_adj[mask]
else:
    df_show = df_adj

st.dataframe(df_show, use_container_width=True, hide_index=True)

st.markdown("---")
st.markdown(
    "<h3 style='font-size:16px; font-weight:600; color:#111827;'>"
    "Top 15 cursos más conectados</h3>",
    unsafe_allow_html=True,
)

if not df_adj.empty:
    fig = build_adjacency_bar_chart(df_adj, top_n=15)
    st.plotly_chart(fig, use_container_width=True)
