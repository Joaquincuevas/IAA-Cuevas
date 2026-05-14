import streamlit as st

LIGHT_CSS = """
<style>
/* ── Ocultar chrome de Streamlit ── */
header[data-testid="stHeader"]  { display: none !important; }
#MainMenu                        { display: none !important; }
footer                           { display: none !important; }
[data-testid="stDeployButton"]   { display: none !important; }
[data-testid="stToolbar"]        { display: none !important; }
[data-testid="stDecoration"]     { display: none !important; }
[data-testid="stStatusWidget"]   { display: none !important; }

/* ── Fondo y layout ── */
.stApp, .main { background-color: #FFFFFF !important; }
.block-container {
    padding-top: 2rem !important;
    padding-left: 2.5rem !important;
    padding-right: 2.5rem !important;
    max-width: 100% !important;
}

/* ── Sidebar siempre visible ── */
section[data-testid="stSidebar"] {
    display: flex !important;
    visibility: visible !important;
    background-color: #FFFFFF !important;
    border-right: 1px solid #E5E7EB !important;
    width: 260px !important;
    min-width: 260px !important;
    max-width: 260px !important;
    transform: none !important;
    left: 0 !important;
}
section[data-testid="stSidebar"] > div,
section[data-testid="stSidebar"] > div > div,
[data-testid="stSidebarContent"] {
    width: 260px !important;
    min-width: 260px !important;
}
button[data-testid="collapsedControl"],
[data-testid="collapsedControl"] {
    display: none !important;
}
section[data-testid="stSidebar"] .stMarkdown,
section[data-testid="stSidebar"] p,
section[data-testid="stSidebar"] span:not([data-testid]) {
    color: #6B7280 !important;
}

/* ── Nav links ── */
[data-testid="stSidebarNav"],
[data-testid="stSidebarNavItems"] {
    width: 100% !important;
    overflow: visible !important;
    padding: 0 !important;
}
[data-testid="stSidebarNav"] li {
    width: 100% !important;
    list-style: none !important;
    overflow: hidden !important;
}
[data-testid="stSidebarNavLink"] {
    color: #6B7280 !important;
    font-size: 14px !important;
    border-radius: 0 !important;
    margin: 0 !important;
    padding: 8px 16px !important;
    border-left: 2px solid transparent !important;
    background: transparent !important;
    font-weight: 400 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    display: block !important;
    overflow: hidden !important;
    white-space: nowrap !important;
    text-overflow: ellipsis !important;
}
[data-testid="stSidebarNavLink"] p,
[data-testid="stSidebarNavLink"] span {
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    display: block !important;
    color: inherit !important;
}
[data-testid="stSidebarNavLink"]:hover {
    background-color: #F7F8FA !important;
    color: #111827 !important;
    border-left: 2px solid #E5E7EB !important;
}
[data-testid="stSidebarNavLink"][aria-current="page"] {
    color: #111827 !important;
    font-weight: 600 !important;
    border-left: 2px solid #1B2A4A !important;
    background: transparent !important;
}

/* ── Ocultar nav automática (reemplazada por st.page_link) ── */
[data-testid="stSidebarNav"] { display: none !important; }

/* ── st.page_link() — navegación manual ── */
[data-testid="stPageLink"] { margin: 0 !important; padding: 0 !important; }
[data-testid="stPageLink-NavLink"] {
    color: #6B7280 !important;
    font-size: 14px !important;
    font-weight: 400 !important;
    padding: 8px 16px !important;
    border-left: 2px solid transparent !important;
    border-radius: 0 !important;
    background: transparent !important;
    text-decoration: none !important;
    display: block !important;
    width: 100% !important;
    box-sizing: border-box !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}
[data-testid="stPageLink-NavLink"]:hover {
    background-color: #F7F8FA !important;
    color: #111827 !important;
    border-left-color: #E5E7EB !important;
}
[data-testid="stPageLink-NavLink"][aria-current="page"] {
    color: #111827 !important;
    font-weight: 600 !important;
    border-left-color: #1B2A4A !important;
    background: transparent !important;
}
[data-testid="stPageLink-NavLink"] p,
[data-testid="stPageLink-NavLink"] span {
    color: inherit !important;
    font-size: inherit !important;
    font-weight: inherit !important;
    margin: 0 !important;
    white-space: nowrap !important;
}

/* ── Métricas ── */
[data-testid="metric-container"] {
    background-color: #F7F8FA !important;
    border: 1px solid #E5E7EB !important;
    border-radius: 8px !important;
    padding: 16px 20px !important;
    box-shadow: none !important;
}
[data-testid="stMetricValue"] {
    color: #111827 !important;
    font-weight: 700 !important;
}
[data-testid="stMetricLabel"] {
    color: #6B7280 !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
}
[data-testid="stMetricDelta"] { color: #6B7280 !important; }

/* ── Tipografía ── */
h1, h2, h3, h4, h5, h6 { color: #111827 !important; font-weight: 700 !important; }
p, li, td { color: #111827; }
.stMarkdown { color: #111827; }
hr { border-top: 1px solid #E5E7EB !important; border-bottom: none !important; }

/* ── Inputs ── */
[data-testid="stTextInput"] input {
    border: 1px solid #E5E7EB !important;
    border-radius: 6px !important;
    color: #111827 !important;
    background: #FFFFFF !important;
    font-size: 14px !important;
}
[data-testid="stTextInput"] input:focus {
    border-color: #1B2A4A !important;
    box-shadow: 0 0 0 2px rgba(27,42,74,0.1) !important;
    outline: none !important;
}

/* ── Labels ── */
[data-testid="stSelectbox"] label,
[data-testid="stMultiSelect"] label,
[data-testid="stSlider"] label,
[data-testid="stCheckbox"] label,
[data-testid="stTextInput"] label {
    color: #111827 !important;
    font-weight: 600 !important;
    font-size: 13px !important;
}

/* ── Botones (default negro) ── */
[data-testid="stButton"] > button {
    background-color: #111827 !important;
    color: #FFFFFF !important;
    border: none !important;
    font-weight: 600 !important;
    border-radius: 6px !important;
    font-size: 14px !important;
    padding: 8px 18px !important;
}
[data-testid="stButton"] > button:hover {
    background-color: #1F2937 !important;
    box-shadow: none !important;
}

/* ── Botón logout en sidebar — texto rojo discreto ── */
section[data-testid="stSidebar"] [data-testid="stButton"] > button {
    background: transparent !important;
    color: #EF4444 !important;
    border: none !important;
    padding: 0 !important;
    font-size: 12px !important;
    font-weight: 400 !important;
    box-shadow: none !important;
    text-align: left !important;
    width: auto !important;
}
section[data-testid="stSidebar"] [data-testid="stButton"] > button:hover {
    background: transparent !important;
    color: #DC2626 !important;
    text-decoration: underline !important;
}

/* ── DataFrames ── */
[data-testid="stDataFrame"] {
    border: 1px solid #E5E7EB !important;
    border-radius: 6px !important;
}

/* ── Alertas ── */
[data-testid="stInfo"] {
    background-color: #EEF2FF !important;
    border-left-color: #1B2A4A !important;
    color: #1B2A4A !important;
}
[data-testid="stWarning"] {
    background-color: #FFFBEB !important;
    border-left-color: #F59E0B !important;
}

/* ── Progress bars ── */
.progress-bar-container {
    background: #E5E7EB;
    border-radius: 4px;
    height: 6px;
    overflow: hidden;
    margin: 4px 0;
}
.progress-bar-fill { height: 100%; border-radius: 4px; }
</style>
"""

LOGIN_EXTRA_CSS = """
<style>
section[data-testid="stSidebar"] {
    display: none !important;
    visibility: hidden !important;
    width: 0 !important;
    min-width: 0 !important;
    transform: translateX(-100%) !important;
}
[data-testid="stSidebarNav"] { display: none !important; }
.stApp                        { background-color: #F7F8FA !important; }
.block-container              { padding-top: 4rem !important; }

[data-testid="stHorizontalBlock"] > [data-testid="column"]:nth-child(2) {
    background: #FFFFFF !important;
    border-radius: 8px !important;
    border: 1px solid #E5E7EB !important;
    padding: 8px 8px 24px 8px !important;
}
</style>
"""

SIDEBAR_LOGO_HTML = """
<div style="padding: 20px 16px 14px 16px; overflow: hidden;">
    <div style="font-size:13px; font-weight:700; color:#111827; letter-spacing:0.2px; white-space:nowrap;">Trace Analytics</div>
    <div style="font-size:10px; color:#9CA3AF; margin-top:2px; white-space:nowrap;">powered by Taula</div>
    <div style="height:1px; background:#E5E7EB; margin-top:14px;"></div>
</div>
"""


def apply_styles() -> None:
    st.markdown(LIGHT_CSS, unsafe_allow_html=True)


def render_sidebar_logo() -> None:
    st.sidebar.markdown(SIDEBAR_LOGO_HTML, unsafe_allow_html=True)


def render_sidebar_nav() -> None:
    with st.sidebar:
        st.page_link("app.py", label="Inicio")
        st.page_link("pages/1_grafo.py", label="Grafo")
        st.page_link("pages/2_cobertura.py", label="Cobertura")
        st.page_link("pages/3_redundancia.py", label="Redundancia")
        st.page_link("pages/4_taula.py", label="Taula")


def render_sidebar_user(email: str) -> None:
    st.sidebar.markdown(f"""
    <div style="padding: 4px 16px 4px 16px; border-top: 1px solid #E5E7EB; margin-top: 20px;">
        <div style="font-size:11px; color:#9CA3AF; margin-bottom:6px;">{email}</div>
    </div>
    """, unsafe_allow_html=True)

    from src.auth import logout
    if st.sidebar.button("Cerrar sesión", key="logout_btn"):
        logout()
