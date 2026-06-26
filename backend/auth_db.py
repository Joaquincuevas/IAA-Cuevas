"""
Capa de usuarios y autenticación.

Diseño orientado a producción:
- Almacenamiento en SQLite (backend/app.db), no en memoria ni en código.
- Contraseñas hasheadas con PBKDF2-HMAC-SHA256 + sal por usuario (librería estándar,
  sin dependencias frágiles). Nunca se guarda ni se devuelve la contraseña en claro.

Los 4 usuarios (2 desarrolladores + 2 cliente) se siembran al iniciar si no existen.
Para actualizar el correo real de los clientes cuando se conozca, usar `manage.py`.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(os.environ.get("APP_DB", str(Path(__file__).parent / "app.db")))

# (email, nombre, rol, contraseña por defecto). Todos con los mismos permisos ("user").
# Francisca y Sebastián usan correos placeholder hasta tener los reales (ver manage.py).
SEED_USERS = [
    ("jjcuevas@miuandes.cl", "Joaquín", "user", "admin123"),
    ("vcuevas@miuandes.cl", "Vicente", "user", "admin123"),
    ("francisca@cliente.cl", "Francisca", "user", "cliente2026"),
    ("sebastian@cliente.cl", "Sebastián", "user", "cliente2026"),
]

_PBKDF2_ITERS = 200_000


# ── Hashing ──────────────────────────────────────────────────────────────────
def hash_password(password: str, iterations: int = _PBKDF2_ITERS) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


# ── Conexión ─────────────────────────────────────────────────────────────────
def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _norm(email: str) -> str:
    return (email or "").strip().lower()


def init_db() -> None:
    conn = _conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            password_hash TEXT NOT NULL,
            last_login TEXT,
            created_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    for email, name, role, pwd in SEED_USERS:
        exists = conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?,?,?,?,?)",
                (email, name, role, hash_password(pwd), datetime.utcnow().isoformat()),
            )
    conn.commit()
    conn.close()


# ── Usuarios ─────────────────────────────────────────────────────────────────
def get_user(email: str) -> dict | None:
    conn = _conn()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (_norm(email),)).fetchone()
    conn.close()
    return dict(row) if row else None


def public_user(u: dict) -> dict:
    return {"email": u["email"], "name": u["name"], "role": u["role"], "last_login": u.get("last_login")}


def verify_login(email: str, password: str) -> dict | None:
    u = get_user(email)
    if not u or not verify_password(password, u["password_hash"]):
        return None
    conn = _conn()
    conn.execute("UPDATE users SET last_login = ? WHERE email = ?", (datetime.utcnow().isoformat(), u["email"]))
    conn.commit()
    conn.close()
    return u


def change_password(email: str, old: str, new: str) -> tuple[bool, str]:
    u = get_user(email)
    if not u or not verify_password(old, u["password_hash"]):
        return False, "La contraseña actual es incorrecta."
    if len(new) < 8:
        return False, "La nueva contraseña debe tener al menos 8 caracteres."
    if new == old:
        return False, "La nueva contraseña debe ser distinta de la actual."
    conn = _conn()
    conn.execute("UPDATE users SET password_hash = ? WHERE email = ?", (hash_password(new), u["email"]))
    conn.commit()
    conn.close()
    return True, "Contraseña actualizada correctamente."
