import streamlit as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

st.set_page_config(
    page_title="Trace Analytics",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

from src.styles import apply_styles, render_sidebar_logo, render_sidebar_nav, render_sidebar_user
from src.auth import require_auth

apply_styles()

if not require_auth():
    st.stop()

email = st.session_state["user_email"]

render_sidebar_logo()
render_sidebar_nav()

with st.sidebar:
    st.markdown("""
    <div style="padding: 4px 16px 12px 16px;">
        <div style="font-size:11px; font-weight:600; color:#111827; margin-bottom:6px;">Carreras</div>
        <div style="font-size:12px; color:#6B7280; line-height:1.8;">
            IOC · ICI · ING<br>ICE · ICC · ICA
        </div>
        <div style="font-size:11px; color:#9CA3AF; margin-top:8px;">Fuente: RA UAndes Functional</div>
    </div>
    """, unsafe_allow_html=True)

render_sidebar_user(email)

# ── Contenido principal ───────────────────────────────────────────────────────
st.markdown(
    "<h1 style='font-size:26px; font-weight:700; color:#111827; margin-bottom:4px;'>"
    "Trace Analytics</h1>",
    unsafe_allow_html=True,
)
st.markdown(
    f"<p style='color:#6B7280; font-size:14px; margin-bottom:24px;'>"
    f"Bienvenido, <b style='color:#111827;'>{st.session_state.get('user_name', email)}</b> — "
    f"Mallas curriculares · Universidad de los Andes</p>",
    unsafe_allow_html=True,
)

from src.data_loader import load_data
data       = load_data()
general    = data["general"]
objectives = data["objectives"]
ra_links   = data["ra_links"]

col1, col2, col3, col4 = st.columns(4)
with col1:
    st.metric("Cursos totales", len(general))
with col2:
    st.metric("Objetivos de aprendizaje", len(objectives))
with col3:
    st.metric("Links entre RAs", len(ra_links))
with col4:
    st.metric("Carreras", general["Carrera"].nunique())

st.markdown("---")

st.markdown("""
<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:8px;">
    <div style="background:#F7F8FA; border:1px solid #E5E7EB; border-radius:8px; padding:24px;">
        <div style="font-size:11px; font-weight:600; color:#9CA3AF; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:10px;">Vista 1</div>
        <div style="font-size:16px; font-weight:700; color:#111827; margin-bottom:8px;">Conexiones Curriculares</div>
        <div style="font-size:13px; color:#6B7280; line-height:1.6;">Tabla de adyacencia interactiva. Qué cursos dependen de cuáles, grado de entrada y salida, intensidad de conexión.</div>
        <div style="margin-top:16px; font-size:13px; color:#1B2A4A; font-weight:600;">Explorar →</div>
    </div>
    <div style="background:#F7F8FA; border:1px solid #E5E7EB; border-radius:8px; padding:24px;">
        <div style="font-size:11px; font-weight:600; color:#9CA3AF; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:10px;">KPI 1</div>
        <div style="font-size:16px; font-weight:700; color:#111827; margin-bottom:8px;">Cobertura Curricular</div>
        <div style="font-size:13px; color:#6B7280; line-height:1.6;">¿Qué porcentaje de objetivos de cada curso están proyectados aguas abajo con alta importancia?</div>
        <div style="margin-top:16px; font-size:13px; color:#1B2A4A; font-weight:600;">Explorar →</div>
    </div>
    <div style="background:#F7F8FA; border:1px solid #E5E7EB; border-radius:8px; padding:24px;">
        <div style="font-size:11px; font-weight:600; color:#9CA3AF; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:10px;">KPI 2</div>
        <div style="font-size:16px; font-weight:700; color:#111827; margin-bottom:8px;">Objetivos Críticos</div>
        <div style="font-size:13px; color:#6B7280; line-height:1.6;">Objetivos demandados por múltiples cursos distintos — los nodos más críticos de la malla.</div>
        <div style="margin-top:16px; font-size:13px; color:#1B2A4A; font-weight:600;">Explorar →</div>
    </div>
</div>
""", unsafe_allow_html=True)
