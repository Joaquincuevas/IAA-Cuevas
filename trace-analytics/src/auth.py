import streamlit as st

USERS: dict[str, dict] = {
    "jjcuevas@miuandes.cl": {"password": "admin123", "role": "admin", "name": "J. Cuevas"},
    "vcuevas@miuandes.cl":  {"password": "admin123", "role": "admin", "name": "V. Cuevas"},
}


def _render_login() -> None:
    from src.styles import LOGIN_EXTRA_CSS
    st.markdown(LOGIN_EXTRA_CSS, unsafe_allow_html=True)

    _, col, _ = st.columns([1, 1.4, 1])
    with col:
        st.markdown("""
        <div style="padding: 32px 32px 24px 32px;">
            <div style="font-size:22px; font-weight:700; color:#111827; letter-spacing:-0.3px;">Trace Analytics</div>
            <div style="font-size:12px; color:#9CA3AF; margin-top:4px; margin-bottom:4px;">powered by Taula</div>
        </div>
        """, unsafe_allow_html=True)

        error_placeholder = st.empty()

        email = st.text_input(
            "Correo electrónico",
            placeholder="usuario@miuandes.cl",
            key="login_email",
        )
        password = st.text_input(
            "Contraseña",
            type="password",
            placeholder="••••••••",
            key="login_password",
        )

        st.markdown("<div style='height:4px'></div>", unsafe_allow_html=True)

        if st.button("Iniciar sesión", use_container_width=True, key="login_submit"):
            user = USERS.get(email.strip())
            if user and user["password"] == password:
                st.session_state["authenticated"] = True
                st.session_state["user_email"] = email.strip()
                st.session_state["user_role"] = user["role"]
                st.session_state["user_name"] = user["name"]
                st.rerun()
            else:
                error_placeholder.markdown(
                    "<p style='color:#EF4444; font-size:13px; margin:0 0 8px 0;'>"
                    "Correo o contraseña incorrectos.</p>",
                    unsafe_allow_html=True,
                )

        st.markdown("""
        <div style="margin-top:24px; font-size:11px; color:#9CA3AF; text-align:center;">
            Universidad de los Andes · Facultad de Ingeniería
        </div>
        """, unsafe_allow_html=True)


def require_auth() -> bool:
    """Returns True if authenticated. Otherwise renders login and returns False."""
    if st.session_state.get("authenticated"):
        return True
    _render_login()
    return False


def logout() -> None:
    for key in ["authenticated", "user_email", "user_role", "user_name"]:
        st.session_state.pop(key, None)
    st.rerun()
