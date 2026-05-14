import streamlit as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

st.set_page_config(page_title="Redundancia — Trace Analytics", layout="wide", initial_sidebar_state="expanded")

from src.styles import apply_styles, render_sidebar_logo, render_sidebar_nav, render_sidebar_user
from src.auth import require_auth
from src.data_loader import load_data, CARRERA_NAMES, CARRERA_COLORS
from src.kpi_calculator import compute_redundancy
from src.visualizer import build_redundancy_chart

apply_styles()

if not require_auth():
    st.stop()

email = st.session_state["user_email"]

render_sidebar_logo()
render_sidebar_nav()

with st.sidebar:
    st.markdown("---")
    min_courses = st.slider(
        "Mínimo de cursos demandantes",
        min_value=1, max_value=10, value=3,
        help="Objetivos que aparecen como prerrequisito en al menos N cursos distintos",
    )
    top_n = st.slider("Ranking — Top N objetivos", min_value=5, max_value=50, value=20)

    carrera_opts = ["Todas"] + sorted(CARRERA_NAMES.keys())
    filter_carrera = st.selectbox(
        "Filtrar por carrera de origen",
        options=carrera_opts,
        format_func=lambda x: "Todas las carreras" if x == "Todas" else CARRERA_NAMES.get(x, x),
    )

render_sidebar_user(email)

# ── Contenido ─────────────────────────────────────────────────────────────────
st.markdown(
    "<h2 style='font-size:22px; font-weight:700; color:#111827; margin-bottom:4px;'>"
    "KPI 2 — Objetivos Críticos</h2>",
    unsafe_allow_html=True,
)
st.markdown(
    "<p style='color:#6B7280; font-size:14px; margin-top:-4px;'>"
    "Objetivos que actúan como prerrequisito en múltiples cursos distintos — "
    "si fallan, muchos cursos quedan sin base.</p>",
    unsafe_allow_html=True,
)

data   = load_data()
result = compute_redundancy(data["objectives"], data["ra_links"], min_count=min_courses)
high_demand = result["high_demand"]

if filter_carrera != "Todas":
    high_demand = high_demand[high_demand["Carrera"] == filter_carrera]

c1, c2, c3, c4 = st.columns(4)
with c1:
    st.metric(f"Objetivos con ≥{min_courses} demandantes", len(high_demand))
with c2:
    if not high_demand.empty:
        top_obj = high_demand.iloc[0]
        st.metric("Objetivo más crítico", top_obj["ID_Objetivo"], f"{int(top_obj['Cursos_Demandantes'])} cursos")
    else:
        st.metric("Objetivo más crítico", "—")
with c3:
    if not high_demand.empty:
        st.metric("Media de demanda", f"{high_demand['Cursos_Demandantes'].mean():.1f} cursos")
    else:
        st.metric("Media de demanda", "—")
with c4:
    unique_courses = len(set(
        c for lst in high_demand["Cursos_Lista"].dropna() for c in lst
    )) if not high_demand.empty else 0
    st.metric("Cursos demandantes únicos", unique_courses)

st.markdown("---")

if high_demand.empty:
    st.warning(f"No hay objetivos con {min_courses}+ cursos demandantes. Ajusta el filtro.")
else:
    col_chart, col_table = st.columns([3, 2])

    with col_chart:
        st.markdown(
            f"<h3 style='font-size:15px; font-weight:600; color:#111827; margin-bottom:8px;'>"
            f"Top {top_n} objetivos más demandados</h3>",
            unsafe_allow_html=True,
        )
        fig = build_redundancy_chart(high_demand, top_n=top_n)
        st.plotly_chart(fig, use_container_width=True)

    with col_table:
        st.markdown(
            "<h3 style='font-size:15px; font-weight:600; color:#111827; margin-bottom:8px;'>"
            "Ranking detallado</h3>",
            unsafe_allow_html=True,
        )
        df_rank = high_demand.head(top_n)[
            ["ID_Objetivo", "Curso_Nombre", "Cursos_Demandantes", "Alta", "Media", "Baja"]
        ].copy().fillna(0)
        for col in ["Alta", "Media", "Baja"]:
            df_rank[col] = df_rank[col].astype(int)
        df_rank = df_rank.reset_index(drop=True)
        df_rank.index += 1
        st.dataframe(
            df_rank.rename(columns={
                "ID_Objetivo": "Objetivo",
                "Curso_Nombre": "Curso",
                "Cursos_Demandantes": "# Cursos",
            }),
            use_container_width=True,
        )

    st.markdown("---")
    st.markdown(
        "<h3 style='font-size:15px; font-weight:600; color:#111827; margin-bottom:8px;'>"
        "Detalle de objetivo seleccionado</h3>",
        unsafe_allow_html=True,
    )

    selected_obj = st.selectbox(
        "Seleccionar objetivo",
        options=["—"] + high_demand["ID_Objetivo"].tolist(),
    )

    if selected_obj != "—":
        obj_row = high_demand[high_demand["ID_Objetivo"] == selected_obj].iloc[0]
        objectives = data["objectives"]
        obj_full   = objectives[objectives["ID_Objetivo"] == selected_obj]

        color = CARRERA_COLORS.get(obj_row.get("Carrera", ""), "#1B2A4A")
        st.markdown(f"""
        <div style="background:#F7F8FA; border:1px solid #E5E7EB; border-left:4px solid {color};
                    border-radius:8px; padding:20px; margin-bottom:16px;">
            <div style="color:#6B7280; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:1px;">
                Objetivo crítico
            </div>
            <div style="color:#111827; font-size:18px; font-weight:700; margin: 4px 0;">{selected_obj}</div>
            <div style="color:#6B7280; font-size:13px;">
                Curso: <b style="color:#111827;">{obj_row.get('Curso_Nombre','')}</b>
            </div>
            <hr style="border-color:#E5E7EB; margin:12px 0;">
            <div style="color:#111827; font-size:14px; line-height:1.5;">
                {obj_full['Objetivo'].values[0] if not obj_full.empty else 'Sin descripción'}
            </div>
            <hr style="border-color:#E5E7EB; margin:12px 0;">
            <div style="display:flex; gap:28px;">
                <div>
                    <div style="color:#6B7280; font-size:10px; text-transform:uppercase; letter-spacing:0.5px;">Cursos demandantes</div>
                    <div style="color:#111827; font-size:26px; font-weight:800;">{int(obj_row['Cursos_Demandantes'])}</div>
                </div>
                <div>
                    <div style="color:#6B7280; font-size:10px; text-transform:uppercase; letter-spacing:0.5px;">Alta</div>
                    <div style="color:#111827; font-size:22px; font-weight:700;">{int(obj_row.get('Alta', 0))}</div>
                </div>
                <div>
                    <div style="color:#6B7280; font-size:10px; text-transform:uppercase; letter-spacing:0.5px;">Media</div>
                    <div style="color:#111827; font-size:22px; font-weight:700;">{int(obj_row.get('Media', 0))}</div>
                </div>
                <div>
                    <div style="color:#6B7280; font-size:10px; text-transform:uppercase; letter-spacing:0.5px;">Baja</div>
                    <div style="color:#111827; font-size:22px; font-weight:700;">{int(obj_row.get('Baja', 0))}</div>
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        demanding_courses = obj_row.get("Cursos_Lista", []) or []
        if demanding_courses:
            st.markdown("<p style='font-size:13px; font-weight:600; color:#111827; margin-bottom:8px;'>Cursos que demandan este objetivo:</p>", unsafe_allow_html=True)
            general     = data["general"]
            id_to_name  = general.set_index("ID")["Nombre"].to_dict()
            cols = st.columns(min(3, len(demanding_courses)))
            for i, cid in enumerate(sorted(demanding_courses)):
                with cols[i % 3]:
                    carrera = cid.split("_")[0]
                    c_color = CARRERA_COLORS.get(carrera, "#1B2A4A")
                    st.markdown(f"""
                    <div style="background:#F7F8FA; border:1px solid #E5E7EB; border-left:3px solid {c_color};
                         padding:8px 12px; margin-bottom:6px; border-radius:0 6px 6px 0;">
                        <div style="color:#1B2A4A; font-size:11px; font-weight:600;">{cid}</div>
                        <div style="color:#6B7280; font-size:12px;">{id_to_name.get(cid, '')}</div>
                    </div>
                    """, unsafe_allow_html=True)

st.markdown("---")
st.markdown(
    "<h3 style='font-size:15px; font-weight:600; color:#111827; margin-bottom:8px;'>"
    "Distribución completa de demanda</h3>",
    unsafe_allow_html=True,
)

import plotly.express as px
all_demand = result["all_demand"].copy()
if filter_carrera != "Todas":
    all_demand = all_demand[all_demand["Curso_ID"].str.startswith(filter_carrera)]

fig_hist = px.histogram(
    all_demand,
    x="Cursos_Demandantes",
    nbins=15,
    color_discrete_sequence=["#1B2A4A"],
    labels={"Cursos_Demandantes": "Número de cursos que demandan el objetivo"},
)
fig_hist.update_layout(
    paper_bgcolor="#FFFFFF", plot_bgcolor="#FFFFFF",
    font=dict(color="#111827"),
    xaxis=dict(gridcolor="#F3F4F6", showline=False),
    yaxis=dict(gridcolor="#F3F4F6", title="Cantidad de objetivos", showline=False),
    height=280, margin=dict(t=10, b=40),
)
st.plotly_chart(fig_hist, use_container_width=True)
