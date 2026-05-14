import streamlit as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

st.set_page_config(page_title="Cobertura — Trace Analytics", layout="wide", initial_sidebar_state="expanded")

from src.styles import apply_styles, render_sidebar_logo, render_sidebar_nav, render_sidebar_user
from src.auth import require_auth
from src.data_loader import load_data, CARRERA_NAMES
from src.kpi_calculator import compute_coverage
from src.visualizer import build_coverage_bar_chart, build_coverage_scatter

apply_styles()

if not require_auth():
    st.stop()

email = st.session_state["user_email"]

render_sidebar_logo()
render_sidebar_nav()

with st.sidebar:
    st.markdown("---")
    carrera_opts = ["Todas"] + sorted(CARRERA_NAMES.keys())
    selected_carrera = st.selectbox(
        "Filtrar por carrera",
        options=carrera_opts,
        format_func=lambda x: "Todas las carreras" if x == "Todas" else CARRERA_NAMES.get(x, x),
    )
    show_zero = st.checkbox("Incluir cursos con 0% cobertura", value=True)

render_sidebar_user(email)

# ── Contenido ─────────────────────────────────────────────────────────────────
st.markdown(
    "<h2 style='font-size:22px; font-weight:700; color:#111827; margin-bottom:4px;'>"
    "KPI 1 — Cobertura Curricular</h2>",
    unsafe_allow_html=True,
)
st.markdown(
    "<p style='color:#6B7280; font-size:14px; margin-top:-4px;'>"
    "Porcentaje de objetivos de cada curso con al menos un link de importancia Alta hacia un curso posterior.</p>",
    unsafe_allow_html=True,
)

data   = load_data()
result = compute_coverage(data["objectives"], data["ra_links"])

overall    = result["overall"]
by_carrera = result["by_carrera"]
by_course  = result["by_course"]

c1, c2, c3, c4 = st.columns(4)
with c1:
    st.metric("Cobertura global", f"{overall*100:.1f}%")
with c2:
    best = by_carrera.iloc[0]
    st.metric("Mejor carrera", CARRERA_NAMES.get(best["Carrera"], best["Carrera"]), f"{best['Cobertura']*100:.1f}%")
with c3:
    worst = by_carrera.iloc[-1]
    st.metric("Menor cobertura", CARRERA_NAMES.get(worst["Carrera"], worst["Carrera"]), f"{worst['Cobertura']*100:.1f}%")
with c4:
    st.metric(
        "Objetivos cubiertos",
        f"{int(by_carrera['Objetivos_Cubiertos'].sum())} / {int(by_carrera['Total_Objetivos'].sum())}",
    )

st.markdown("---")
col_chart, col_progress = st.columns([3, 2])

with col_chart:
    st.markdown(
        "<h3 style='font-size:15px; font-weight:600; color:#111827; margin-bottom:12px;'>"
        "Cobertura por carrera</h3>",
        unsafe_allow_html=True,
    )
    fig_bar = build_coverage_bar_chart(by_carrera)
    st.plotly_chart(fig_bar, use_container_width=True)

with col_progress:
    st.markdown(
        "<h3 style='font-size:15px; font-weight:600; color:#111827; margin-bottom:12px;'>"
        "Barras de progreso</h3>",
        unsafe_allow_html=True,
    )
    for _, row in by_carrera.iterrows():
        pct   = row["Cobertura"] * 100
        label = CARRERA_NAMES.get(row["Carrera"], row["Carrera"])
        dot_color = "#10B981" if pct >= 50 else "#F59E0B" if pct >= 25 else "#EF4444"
        st.markdown(f"""
        <div style="margin-bottom:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <span style="color:#111827; font-size:13px; font-weight:600;">
                    <span style="color:{dot_color}; font-size:8px; vertical-align:middle; margin-right:5px;">●</span>{label}
                </span>
                <span style="color:#111827; font-size:13px; font-weight:600;">{pct:.1f}%</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width:{pct}%; background:#1B2A4A;"></div>
            </div>
            <div style="color:#6B7280; font-size:11px; margin-top:3px;">
                {int(row['Objetivos_Cubiertos'])} / {int(row['Total_Objetivos'])} objetivos
            </div>
        </div>
        """, unsafe_allow_html=True)

st.markdown("---")
st.markdown(
    "<h3 style='font-size:15px; font-weight:600; color:#111827; margin-bottom:8px;'>"
    "Dispersión: objetivos vs cobertura por curso</h3>",
    unsafe_allow_html=True,
)
fig_scatter = build_coverage_scatter(by_course)
st.plotly_chart(fig_scatter, use_container_width=True)

st.markdown("---")
st.markdown(
    "<h3 style='font-size:15px; font-weight:600; color:#111827; margin-bottom:8px;'>"
    "Detalle por curso</h3>",
    unsafe_allow_html=True,
)

df_display = by_course.copy()
if selected_carrera != "Todas":
    df_display = df_display[df_display["Carrera"] == selected_carrera]
if not show_zero:
    df_display = df_display[df_display["Cobertura"] > 0]
df_display = df_display.sort_values("Cobertura", ascending=False)

general = data["general"]
id_to_nombre = general.set_index("ID")["Nombre"].to_dict()
df_display = df_display.copy()
df_display["Nombre_Curso"] = df_display["ID"].map(id_to_nombre).fillna(df_display["ID"])
df_display["Cobertura_%"] = (df_display["Cobertura"] * 100).round(1)

st.dataframe(
    df_display[["ID", "Nombre_Curso", "Carrera_Nombre", "Objetivos_Cubiertos", "Total_Objetivos", "Cobertura_%"]].rename(columns={
        "ID": "ID Curso",
        "Nombre_Curso": "Nombre",
        "Carrera_Nombre": "Carrera",
        "Objetivos_Cubiertos": "Cubiertos",
        "Total_Objetivos": "Total",
        "Cobertura_%": "Cobertura (%)",
    }),
    use_container_width=True,
    hide_index=True,
)
