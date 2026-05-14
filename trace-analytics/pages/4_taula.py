import streamlit as st
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

st.set_page_config(
    page_title="Taula — Trace Analytics",
    layout="wide",
    initial_sidebar_state="expanded",
)

from src.styles import apply_styles, render_sidebar_logo, render_sidebar_nav, render_sidebar_user
from src.auth import require_auth
from src.data_loader import load_data

apply_styles()

if not require_auth():
    st.stop()

email = st.session_state["user_email"]
render_sidebar_logo()
render_sidebar_nav()
render_sidebar_user(email)

# ── API Key ────────────────────────────────────────────────────────────────────
def _get_api_key() -> str:
    try:
        return st.secrets["GEMINI_API_KEY"] or ""
    except Exception:
        pass
    return os.environ.get("GEMINI_API_KEY", "")

api_key = _get_api_key()

if not api_key:
    st.markdown("""
    <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:8px;
                padding:16px 20px; margin:16px 0; max-width:600px;">
        <div style="font-size:14px; font-weight:600; color:#991B1B; margin-bottom:6px;">
            GEMINI_API_KEY no configurada
        </div>
        <div style="font-size:13px; color:#7F1D1D; line-height:1.6;">
            Obtén una clave gratuita en <code>aistudio.google.com/apikey</code>
            y agrégala como secret <code>GEMINI_API_KEY</code> en la configuración
            de la app, o como variable de entorno antes de iniciar Streamlit.
        </div>
    </div>
    """, unsafe_allow_html=True)
    st.stop()

# ── Gemini ─────────────────────────────────────────────────────────────────────
try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    st.error("Instala el paquete requerido: `pip install google-genai`")
    st.stop()


@st.cache_data(show_spinner=False)
def _build_system_prompt() -> str:
    data = load_data()
    return (
        "Eres Taula, asistente de inteligencia artificial de Trace Analytics, "
        "desarrollado para el Area Curricular de la Facultad de Ingenieria y Ciencias "
        "Aplicadas de la Universidad de los Andes (Chile).\n\n"
        "Tu proposito es ayudar a analizar la malla curricular, identificar brechas, "
        "redundancias, cursos criticos y responder preguntas sobre como los Resultados "
        "de Aprendizaje (RAs) se conectan entre cursos y contribuyen al perfil de egreso.\n\n"
        "DATOS COMPLETOS DE LA MALLA:\n\n"
        "=== CURSOS (139 cursos, 6 carreras) ===\n"
        + data["general"].to_string(index=False)
        + "\n\n=== PRERREQUISITOS ===\n"
        + data["requirements"].to_string(index=False)
        + "\n\n=== OBJETIVOS DE APRENDIZAJE (RAs) ===\n"
        + data["objectives"].to_string(index=False)
        + "\n\n=== LINKS ENTRE OBJETIVOS (925 conexiones) ===\n"
        + data["ra_links"].to_string(index=False)
        + "\n\n"
        "CARRERAS:\n"
        "- IOC: Ingenieria Civil en Obras Civiles\n"
        "- ICI: Ingenieria Civil Industrial\n"
        "- ING: Ingenieria General (ciclo basico comun)\n"
        "- ICE: Ingenieria Civil Electrica\n"
        "- ICC: Ingenieria Civil en Computacion\n"
        "- ICA: Ingenieria Civil Ambiental\n\n"
        "Responde siempre en espanol. Se analitico, preciso y util. "
        "Cuando menciones cursos, incluye su ID y nombre completo. "
        "Puedes hacer analisis de grafos conceptualmente: identificar nodos criticos, "
        "caminos de dependencia, clusters de objetivos relacionados, brechas de cobertura."
    )


# ── Sesion de chat ─────────────────────────────────────────────────────────────
if "taula_client" not in st.session_state:
    st.session_state.taula_client = genai.Client(api_key=api_key)

if "taula_chat" not in st.session_state:
    st.session_state.taula_chat = st.session_state.taula_client.chats.create(
        model="gemini-2.0-flash",
        config=genai_types.GenerateContentConfig(
            system_instruction=_build_system_prompt(),
        ),
    )

if "taula_history" not in st.session_state:
    st.session_state.taula_history: list[dict] = []

# ── UI ─────────────────────────────────────────────────────────────────────────
title_col, _, btn_col = st.columns([5, 1, 1])
with title_col:
    st.markdown("""
    <div style="margin-bottom:4px;">
        <span style="font-size:24px; font-weight:700; color:#111827;">Taula</span>
        <span style="font-size:11px; font-weight:500; color:#9CA3AF; background:#F7F8FA;
                     border:1px solid #E5E7EB; border-radius:4px; padding:2px 8px;
                     margin-left:10px; vertical-align:middle;">powered by Gemini</span>
    </div>
    <p style="color:#6B7280; font-size:14px; margin-bottom:8px;">
        Asistente IA para analisis curricular &middot; Facultad de Ingenieria UAndes
    </p>
    """, unsafe_allow_html=True)

with btn_col:
    st.markdown("<div style='margin-top:10px;'></div>", unsafe_allow_html=True)
    if st.button("Nueva conversacion", key="new_chat_btn", use_container_width=True):
        for key in ["taula_chat", "taula_history", "taula_client"]:
            st.session_state.pop(key, None)
        st.rerun()

# Mensaje de bienvenida fijo (no enviado a Gemini)
with st.chat_message("assistant"):
    st.markdown(
        "Hola, soy **Taula**. Tengo acceso completo a la malla curricular de las 6 carreras "
        "de la Facultad de Ingenieria. Puedo identificar cursos criticos, brechas de cobertura, "
        "redundancias y responder cualquier pregunta sobre como se conectan los Resultados de "
        "Aprendizaje. En que puedo ayudarte?"
    )

# Historial visual
for msg in st.session_state.taula_history:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# Input
if user_input := st.chat_input("Pregunta sobre la malla curricular..."):
    st.session_state.taula_history.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)

    with st.chat_message("assistant"):
        with st.spinner("Taula esta analizando..."):
            try:
                response = st.session_state.taula_chat.send_message(user_input)
                reply = response.text
            except Exception as exc:
                reply = f"Lo siento, ocurrio un error al contactar a Gemini: {exc}"
        st.markdown(reply)
        st.session_state.taula_history.append({"role": "assistant", "content": reply})
