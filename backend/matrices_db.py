"""Persistencia de matrices de tributación subidas por usuarios.

Las planillas base (5 carreras) viven como archivos Excel en /data y se versionan
en el repo. Las subidas por clientes se guardan como BLOB en SQLite (app.db),
con los mismos niveles de persistencia que usuarios y resultados IA.
"""

import hashlib
import os
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(os.environ.get("APP_DB", str(Path(__file__).parent / "app.db")))


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_matrices_table() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS uploaded_matrices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                carrera TEXT NOT NULL UNIQUE,
                carrera_nombre TEXT NOT NULL DEFAULT '',
                filename TEXT NOT NULL DEFAULT '',
                uploaded_by TEXT NOT NULL DEFAULT '',
                uploaded_at TEXT NOT NULL,
                file_blob BLOB NOT NULL,
                n_cursos INTEGER NOT NULL DEFAULT 0,
                n_tributaciones INTEGER NOT NULL DEFAULT 0,
                n_competencias INTEGER NOT NULL DEFAULT 0
            )
            """
        )


def save_matriz(
    carrera: str,
    carrera_nombre: str,
    filename: str,
    file_blob: bytes,
    uploaded_by: str,
    n_cursos: int,
    n_tributaciones: int,
    n_competencias: int,
) -> dict:
    """Insert or replace the planilla for a carrera. Returns the stored row (sin blob)."""
    now = datetime.utcnow().isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO uploaded_matrices
                (carrera, carrera_nombre, filename, uploaded_by, uploaded_at,
                 file_blob, n_cursos, n_tributaciones, n_competencias)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(carrera) DO UPDATE SET
                carrera_nombre=excluded.carrera_nombre,
                filename=excluded.filename,
                uploaded_by=excluded.uploaded_by,
                uploaded_at=excluded.uploaded_at,
                file_blob=excluded.file_blob,
                n_cursos=excluded.n_cursos,
                n_tributaciones=excluded.n_tributaciones,
                n_competencias=excluded.n_competencias
            """,
            (carrera, carrera_nombre, filename, uploaded_by, now,
             file_blob, n_cursos, n_tributaciones, n_competencias),
        )
    rows = list_matrices()
    return next(r for r in rows if r["carrera"] == carrera)


def list_matrices() -> list[dict]:
    """All uploaded planillas, metadata only (no blob)."""
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, carrera, carrera_nombre, filename, uploaded_by, uploaded_at,
                   n_cursos, n_tributaciones, n_competencias
            FROM uploaded_matrices ORDER BY carrera
            """
        ).fetchall()
    return [dict(r) for r in rows]


def get_blob(carrera: str) -> bytes | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT file_blob FROM uploaded_matrices WHERE carrera = ?", (carrera,)
        ).fetchone()
    return row["file_blob"] if row else None


def delete_matriz(carrera: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM uploaded_matrices WHERE carrera = ?", (carrera,))
    return cur.rowcount > 0


def fingerprint() -> str:
    """Hash estable del conjunto de planillas subidas (para invalidar cache IA)."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT carrera, uploaded_at FROM uploaded_matrices ORDER BY carrera"
        ).fetchall()
    raw = "|".join(f"{r['carrera']}@{r['uploaded_at']}" for r in rows)
    return hashlib.md5(raw.encode()).hexdigest() if raw else ""
