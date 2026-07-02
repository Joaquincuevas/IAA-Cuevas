"""
Capa de persistencia para el módulo de análisis con IA.

Tablas (todas en app.db, el mismo SQLite que auth_db):
  ai_jobs               — metadatos de corridas batch
  ai_ra_pe_proposals    — propuestas RA → PE generadas por Groq
  ai_redundancy_proposals — pares redundantes semánticos
  ai_votes              — votos de usuarios sobre propuestas

La BD se inicializa llamando a init_ai_tables() desde main.py lifespan,
igual que auth_db.init_db().

Umbral de votos: con APPROVE_THRESHOLD=1 un solo voto 'approve' aprueba la propuesta
(análogo para 'reject'). Los votos quedan registrados en ai_votes para auditoría.
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

DB_PATH = Path(os.environ.get("APP_DB", str(Path(__file__).parent / "app.db")))

APPROVE_THRESHOLD = 1
REJECT_THRESHOLD = 1


class JobCancelled(Exception):
    """El usuario solicitó cancelar el job en curso."""


# ── Conexión ──────────────────────────────────────────────────────────────────
def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ── Inicialización ────────────────────────────────────────────────────────────
def init_ai_tables() -> None:
    conn = _conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS ai_jobs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            job_type    TEXT NOT NULL,          -- 'conexiones' | 'redundancia' | 'all'
            carrera     TEXT,                   -- NULL = todas las carreras
            status      TEXT NOT NULL DEFAULT 'pending',  -- pending|running|done|error
            excel_hash  TEXT,
            started_at  TEXT,
            finished_at TEXT,
            error_msg   TEXT,
            stats_json  TEXT                    -- JSON con contadores finales
        );

        CREATE TABLE IF NOT EXISTS ai_ra_pe_proposals (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id       INTEGER NOT NULL REFERENCES ai_jobs(id),
            carrera      TEXT NOT NULL,
            ra_id        TEXT NOT NULL,
            ra_texto     TEXT NOT NULL,
            curso_id     TEXT NOT NULL,
            curso_nombre TEXT NOT NULL,
            pe_id        TEXT NOT NULL,          -- 'PE5', 'PE10', …
            pe_texto     TEXT NOT NULL,
            confianza    REAL NOT NULL DEFAULT 0.0,
            razon        TEXT NOT NULL DEFAULT '',
            status       TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
            created_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_redundancy_proposals (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id      INTEGER NOT NULL REFERENCES ai_jobs(id),
            carrera     TEXT NOT NULL,
            ra_id_a     TEXT NOT NULL,
            ra_texto_a  TEXT NOT NULL,
            curso_a     TEXT NOT NULL,
            ra_id_b     TEXT NOT NULL,
            ra_texto_b  TEXT NOT NULL,
            curso_b     TEXT NOT NULL,
            similitud   REAL NOT NULL DEFAULT 0.0,
            razon       TEXT NOT NULL DEFAULT '',
            tipo        TEXT NOT NULL DEFAULT 'semantica',  -- 'semantica'|'curricular'
            status      TEXT NOT NULL DEFAULT 'pending',
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_votes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            email       TEXT NOT NULL,
            target_type TEXT NOT NULL,   -- 'ra_pe' | 'redundancy'
            target_id   INTEGER NOT NULL,
            voto        TEXT NOT NULL,   -- 'approve' | 'reject'
            comentario  TEXT,
            created_at  TEXT NOT NULL,
            UNIQUE(email, target_type, target_id)
        );

        CREATE INDEX IF NOT EXISTS idx_ai_proposals_carrera
            ON ai_ra_pe_proposals(carrera, status);
        CREATE INDEX IF NOT EXISTS idx_ai_redundancy_carrera
            ON ai_redundancy_proposals(carrera, status);
        CREATE INDEX IF NOT EXISTS idx_ai_votes_target
            ON ai_votes(target_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_ai_jobs_type
            ON ai_jobs(job_type, status);
        """
    )
    conn.commit()
    # Migración: columna de progreso en jobs existentes
    try:
        conn.execute("ALTER TABLE ai_jobs ADD COLUMN progress_json TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    reconcile_vote_statuses()
    conn.close()


def _status_from_vote_tally(
    conn: sqlite3.Connection,
    target_type: str,
    target_id: int,
    tally: dict[str, int],
) -> str | None:
    approves = tally.get("approve", 0)
    rejects = tally.get("reject", 0)
    if approves >= APPROVE_THRESHOLD and approves > rejects:
        return "approved"
    if rejects >= REJECT_THRESHOLD and rejects > approves:
        return "rejected"
    if approves >= APPROVE_THRESHOLD and rejects >= REJECT_THRESHOLD:
        last = conn.execute(
            """SELECT voto FROM ai_votes
               WHERE target_type=? AND target_id=?
               ORDER BY created_at DESC LIMIT 1""",
            (target_type, target_id),
        ).fetchone()
        if last:
            return "approved" if last["voto"] == "approve" else "rejected"
    if approves >= APPROVE_THRESHOLD:
        return "approved"
    if rejects >= REJECT_THRESHOLD:
        return "rejected"
    return None


def reconcile_vote_statuses() -> None:
    """Aplica votos ya guardados al status de propuestas (p. ej. tras cambiar umbral)."""
    conn = _conn()
    for target_type, table in (
        ("ra_pe", "ai_ra_pe_proposals"),
        ("redundancy", "ai_redundancy_proposals"),
    ):
        ids = conn.execute(f"SELECT id FROM {table}").fetchall()
        for row in ids:
            tid = row["id"]
            counts = conn.execute(
                "SELECT voto, COUNT(*) as n FROM ai_votes WHERE target_type=? AND target_id=? GROUP BY voto",
                (target_type, tid),
            ).fetchall()
            if not counts:
                continue
            tally = {r["voto"]: r["n"] for r in counts}
            new_status = _status_from_vote_tally(conn, target_type, tid, tally)
            if new_status:
                conn.execute(f"UPDATE {table} SET status=? WHERE id=?", (new_status, tid))
    conn.commit()
    conn.close()


def _parse_job_row(row: sqlite3.Row | dict) -> dict:
    d = dict(row)
    if d.get("stats_json"):
        try:
            d["stats"] = json.loads(d.pop("stats_json"))
        except Exception:
            d["stats"] = {}
    else:
        d.pop("stats_json", None)
        d["stats"] = {}
    if d.get("progress_json"):
        try:
            d["progress"] = json.loads(d.pop("progress_json"))
        except Exception:
            d["progress"] = {}
    else:
        d.pop("progress_json", None)
        d["progress"] = {}
    return d


# ── Jobs ──────────────────────────────────────────────────────────────────────
def create_job(job_type: str, carrera: str | None, excel_hash: str) -> int:
    conn = _conn()
    cur = conn.execute(
        "INSERT INTO ai_jobs (job_type, carrera, status, excel_hash, started_at) VALUES (?,?,?,?,?)",
        (job_type, carrera, "running", excel_hash, datetime.utcnow().isoformat()),
    )
    job_id = cur.lastrowid
    conn.commit()
    conn.close()
    return job_id  # type: ignore[return-value]


def update_job_progress(job_id: int, progress: dict) -> None:
    """Actualiza progreso en tiempo real (visible vía polling)."""
    progress = {**progress, "updated_at": datetime.utcnow().isoformat()}
    conn = _conn()
    conn.execute(
        "UPDATE ai_jobs SET progress_json=? WHERE id=?",
        (json.dumps(progress, ensure_ascii=False), job_id),
    )
    conn.commit()
    conn.close()


def finish_job(job_id: int, stats: dict) -> None:
    if is_job_cancelled(job_id):
        return
    conn = _conn()
    conn.execute(
        """UPDATE ai_jobs SET status='done', finished_at=?, stats_json=?,
           progress_json=? WHERE id=?""",
        (
            datetime.utcnow().isoformat(),
            json.dumps(stats, ensure_ascii=False),
            json.dumps({"phase": "done", "pct": 100, "message": "Completado"}, ensure_ascii=False),
            job_id,
        ),
    )
    conn.commit()
    conn.close()


def fail_job(job_id: int, error: str) -> None:
    if is_job_cancelled(job_id):
        return
    conn = _conn()
    conn.execute(
        "UPDATE ai_jobs SET status='error', finished_at=?, error_msg=? WHERE id=?",
        (datetime.utcnow().isoformat(), error[:2000], job_id),
    )
    conn.commit()
    conn.close()


def is_job_cancelled(job_id: int) -> bool:
    conn = _conn()
    row = conn.execute("SELECT status FROM ai_jobs WHERE id=?", (job_id,)).fetchone()
    conn.close()
    return row is not None and row["status"] == "cancelled"


def cancel_job(job_id: int, reason: str = "Cancelado por el usuario") -> bool:
    """Marca un job activo como cancelado. El hilo lo detecta en el siguiente paso."""
    conn = _conn()
    cur = conn.execute(
        """UPDATE ai_jobs SET status='cancelled', finished_at=?, error_msg=?,
           progress_json=? WHERE id=? AND status IN ('pending', 'running')""",
        (
            datetime.utcnow().isoformat(),
            reason[:2000],
            json.dumps(
                {"phase": "cancelled", "pct": 0, "message": reason},
                ensure_ascii=False,
            ),
            job_id,
        ),
    )
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def cancel_current_job(reason: str = "Cancelado por el usuario") -> dict | None:
    running = get_running_jobs()
    if not running:
        return None
    job_id = running[0]["id"]
    if not cancel_job(job_id, reason):
        return None
    return get_job(job_id)


def get_current_job() -> dict | None:
    running = get_running_jobs()
    return running[0] if running else None


def update_cancelled_stats(job_id: int, stats: dict) -> None:
    """Guarda stats parciales al cancelar (propuestas ya insertadas)."""
    if not stats:
        return
    conn = _conn()
    conn.execute(
        "UPDATE ai_jobs SET stats_json=? WHERE id=? AND status='cancelled'",
        (json.dumps(stats, ensure_ascii=False), job_id),
    )
    conn.commit()
    conn.close()


def get_job(job_id: int) -> dict | None:
    conn = _conn()
    row = conn.execute("SELECT * FROM ai_jobs WHERE id=?", (job_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return _parse_job_row(row)


def get_latest_job(job_type: str, carrera: str | None = None) -> dict | None:
    conn = _conn()
    if carrera:
        row = conn.execute(
            "SELECT * FROM ai_jobs WHERE job_type=? AND carrera=? AND status='done' ORDER BY id DESC LIMIT 1",
            (job_type, carrera),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM ai_jobs WHERE job_type=? AND status='done' ORDER BY id DESC LIMIT 1",
            (job_type,),
        ).fetchone()
    conn.close()
    if not row:
        return None
    return _parse_job_row(row)


def get_running_jobs() -> list[dict]:
    conn = _conn()
    rows = conn.execute(
        "SELECT * FROM ai_jobs WHERE status IN ('pending','running') ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return [_parse_job_row(r) for r in rows]


def recover_orphan_jobs(reason: str = "Interrumpido al reiniciar el servidor") -> int:
    """
    Marca jobs pending/running como error.
    El hilo en background no sobrevive a un reinicio del contenedor; sin esto
    la UI queda en 'procesando' indefinidamente y bloquea nuevos recálculos.
    """
    conn = _conn()
    cur = conn.execute(
        """UPDATE ai_jobs
           SET status='error', finished_at=?, error_msg=?
           WHERE status IN ('pending', 'running')""",
        (datetime.utcnow().isoformat(), reason[:2000]),
    )
    n = cur.rowcount
    conn.commit()
    conn.close()
    return n


# ── RA→PE proposals ───────────────────────────────────────────────────────────
def bulk_insert_ra_pe(job_id: int, proposals: list[dict]) -> int:
    """Insert list of proposal dicts; returns count inserted."""
    if not proposals:
        return 0
    now = datetime.utcnow().isoformat()
    rows = [
        (
            job_id,
            p["carrera"],
            p["ra_id"],
            p["ra_texto"],
            p["curso_id"],
            p["curso_nombre"],
            p["pe_id"],
            p["pe_texto"],
            float(p.get("confianza", 0.0)),
            str(p.get("razon", "")),
            "pending",
            now,
        )
        for p in proposals
    ]
    conn = _conn()
    conn.executemany(
        """INSERT INTO ai_ra_pe_proposals
           (job_id, carrera, ra_id, ra_texto, curso_id, curso_nombre,
            pe_id, pe_texto, confianza, razon, status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    conn.commit()
    conn.close()
    return len(rows)


def _ra_pe_order_clause(sort: str | None) -> str:
    if sort == "confianza_asc":
        return "confianza ASC, id ASC"
    if sort == "curso":
        return "carrera, curso_id, pe_id, confianza DESC"
    return "confianza DESC, id DESC"


def get_ra_pe_proposals(
    carrera: str | None = None,
    status: str | None = None,
    curso: str | None = None,
    pe: str | None = None,
    confianza_min: float | None = None,
    confianza_max: float | None = None,
    sort: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict]:
    clauses: list[str] = []
    params: list[Any] = []

    if carrera:
        clauses.append("carrera = ?")
        params.append(carrera)
    if status:
        clauses.append("status = ?")
        params.append(status)
    if curso:
        clauses.append("curso_id LIKE ?")
        params.append(f"%{curso}%")
    if pe:
        clauses.append("pe_id = ?")
        params.append(pe)
    if confianza_min is not None:
        clauses.append("confianza >= ?")
        params.append(confianza_min)
    if confianza_max is not None:
        clauses.append("confianza <= ?")
        params.append(confianza_max)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    order = _ra_pe_order_clause(sort)
    params.extend([limit, offset])

    conn = _conn()
    rows = conn.execute(
        f"SELECT * FROM ai_ra_pe_proposals {where} ORDER BY {order} LIMIT ? OFFSET ?",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def count_ra_pe_proposals(
    carrera: str | None = None,
    status: str | None = None,
    confianza_min: float | None = None,
    confianza_max: float | None = None,
) -> int:
    clauses: list[str] = []
    params: list[Any] = []
    if carrera:
        clauses.append("carrera = ?")
        params.append(carrera)
    if status:
        clauses.append("status = ?")
        params.append(status)
    if confianza_min is not None:
        clauses.append("confianza >= ?")
        params.append(confianza_min)
    if confianza_max is not None:
        clauses.append("confianza <= ?")
        params.append(confianza_max)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    conn = _conn()
    n = conn.execute(f"SELECT COUNT(*) FROM ai_ra_pe_proposals {where}", params).fetchone()[0]
    conn.close()
    return n


def delete_ra_pe_proposals_for_carrera(carrera: str) -> None:
    conn = _conn()
    conn.execute("DELETE FROM ai_ra_pe_proposals WHERE carrera=?", (carrera,))
    conn.commit()
    conn.close()


# ── Redundancy proposals ──────────────────────────────────────────────────────
def bulk_insert_redundancy(job_id: int, proposals: list[dict]) -> int:
    if not proposals:
        return 0
    now = datetime.utcnow().isoformat()
    rows = [
        (
            job_id,
            p["carrera"],
            p["ra_id_a"],
            p["ra_texto_a"],
            p["curso_a"],
            p["ra_id_b"],
            p["ra_texto_b"],
            p["curso_b"],
            float(p.get("similitud", 0.0)),
            str(p.get("razon", "")),
            str(p.get("tipo", "semantica")),
            "pending",
            now,
        )
        for p in proposals
    ]
    conn = _conn()
    conn.executemany(
        """INSERT INTO ai_redundancy_proposals
           (job_id, carrera, ra_id_a, ra_texto_a, curso_a,
            ra_id_b, ra_texto_b, curso_b,
            similitud, razon, tipo, status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    conn.commit()
    conn.close()
    return len(rows)


def get_redundancy_proposals(
    carrera: str | None = None,
    status: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict]:
    clauses: list[str] = []
    params: list[Any] = []
    if carrera:
        clauses.append("carrera = ?")
        params.append(carrera)
    if status:
        clauses.append("status = ?")
        params.append(status)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    params.extend([limit, offset])
    conn = _conn()
    rows = conn.execute(
        f"SELECT * FROM ai_redundancy_proposals {where} ORDER BY similitud DESC LIMIT ? OFFSET ?",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_redundancy_proposals_for_carrera(carrera: str) -> None:
    conn = _conn()
    conn.execute("DELETE FROM ai_redundancy_proposals WHERE carrera=?", (carrera,))
    conn.commit()
    conn.close()


# ── Votes ─────────────────────────────────────────────────────────────────────
def cast_vote(email: str, target_type: str, target_id: int, voto: str, comentario: str | None) -> dict:
    """Insert or replace a vote; recalculate proposal status; return updated proposal."""
    conn = _conn()
    conn.execute(
        """INSERT INTO ai_votes (email, target_type, target_id, voto, comentario, created_at)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(email, target_type, target_id)
           DO UPDATE SET voto=excluded.voto, comentario=excluded.comentario, created_at=excluded.created_at""",
        (email.strip().lower(), target_type, target_id, voto, comentario, datetime.utcnow().isoformat()),
    )
    conn.commit()

    # Recount votes for this target
    counts = conn.execute(
        "SELECT voto, COUNT(*) as n FROM ai_votes WHERE target_type=? AND target_id=? GROUP BY voto",
        (target_type, target_id),
    ).fetchall()
    tally = {r["voto"]: r["n"] for r in counts}
    new_status = _status_from_vote_tally(conn, target_type, target_id, tally)
    if not new_status:
        new_status = "approved" if voto == "approve" else "rejected"

    table = "ai_ra_pe_proposals" if target_type == "ra_pe" else "ai_redundancy_proposals"
    conn.execute(f"UPDATE {table} SET status=? WHERE id=?", (new_status, target_id))
    conn.commit()

    row = conn.execute(f"SELECT * FROM {table} WHERE id=?", (target_id,)).fetchone()
    conn.close()
    return dict(row) if row else {}


def get_votes_for_target(target_type: str, target_id: int) -> list[dict]:
    conn = _conn()
    rows = conn.execute(
        "SELECT email, voto, comentario, created_at FROM ai_votes WHERE target_type=? AND target_id=?",
        (target_type, target_id),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── KPIs (detección automática IA, sin filtro por status) ─────────────────────
KPI_CONFIANZA_MIN = 0.5
KPI_SIMILITUD_MIN = 0.9


def get_ai_kpis(total_ras: int) -> dict:
    """KPIs ejecutivos de salida IA para el dashboard de inicio."""
    conn = _conn()

    ras_con_conexion = conn.execute(
        "SELECT COUNT(DISTINCT ra_id) FROM ai_ra_pe_proposals WHERE confianza >= ?",
        (KPI_CONFIANZA_MIN,),
    ).fetchone()[0]

    propuestas_alta_confianza = conn.execute(
        "SELECT COUNT(*) FROM ai_ra_pe_proposals WHERE confianza >= ?",
        (KPI_CONFIANZA_MIN,),
    ).fetchone()[0]

    ras_alta_sim = conn.execute(
        """
        SELECT COUNT(*) FROM (
            SELECT ra_id_a AS ra_id FROM ai_redundancy_proposals WHERE similitud >= ?
            UNION
            SELECT ra_id_b AS ra_id FROM ai_redundancy_proposals WHERE similitud >= ?
        )
        """,
        (KPI_SIMILITUD_MIN, KPI_SIMILITUD_MIN),
    ).fetchone()[0]

    conn.close()

    trazabilidad_pct = round(ras_con_conexion / total_ras * 100, 1) if total_ras else 0.0
    return {
        "trazabilidad_pct": trazabilidad_pct,
        "trazabilidad_ras": ras_con_conexion,
        "redundancia_alta_similitud": ras_alta_sim,
        "total_ras": total_ras,
        "propuestas_alta_confianza": propuestas_alta_confianza,
    }


# ── Stats ─────────────────────────────────────────────────────────────────────
def get_ai_stats(carrera: str | None = None) -> dict:
    conn = _conn()
    q_filter = "WHERE carrera=?" if carrera else ""
    params = (carrera,) if carrera else ()

    def _count(table: str, extra: str = "") -> int:
        clause = f"{q_filter} {'AND' if q_filter and extra else ''} {extra}".strip()
        if clause and not clause.startswith("WHERE"):
            clause = "WHERE " + clause.lstrip("AND ").lstrip("OR ")
        return conn.execute(f"SELECT COUNT(*) FROM {table} {clause}", params if q_filter else ()).fetchone()[0]

    ra_pe_total = _count("ai_ra_pe_proposals")
    ra_pe_pending = conn.execute(
        f"SELECT COUNT(*) FROM ai_ra_pe_proposals {q_filter} {'AND' if q_filter else 'WHERE'} status='pending'",
        params if carrera else (),
    ).fetchone()[0]
    ra_pe_approved = conn.execute(
        f"SELECT COUNT(*) FROM ai_ra_pe_proposals {q_filter} {'AND' if q_filter else 'WHERE'} status='approved'",
        params if carrera else (),
    ).fetchone()[0]
    ra_pe_rejected = conn.execute(
        f"SELECT COUNT(*) FROM ai_ra_pe_proposals {q_filter} {'AND' if q_filter else 'WHERE'} status='rejected'",
        params if carrera else (),
    ).fetchone()[0]

    red_total = conn.execute(
        f"SELECT COUNT(*) FROM ai_redundancy_proposals {q_filter}",
        params if carrera else (),
    ).fetchone()[0]
    red_pending = conn.execute(
        f"SELECT COUNT(*) FROM ai_redundancy_proposals {q_filter} {'AND' if q_filter else 'WHERE'} status='pending'",
        params if carrera else (),
    ).fetchone()[0]

    conn.close()
    return {
        "ra_pe": {
            "total": ra_pe_total,
            "pending": ra_pe_pending,
            "approved": ra_pe_approved,
            "rejected": ra_pe_rejected,
        },
        "redundancia": {
            "total": red_total,
            "pending": red_pending,
        },
    }


# ── Export ────────────────────────────────────────────────────────────────────
def get_all_ra_pe_for_export(carrera: str | None = None) -> list[dict]:
    """Todas las propuestas RA→PE (cualquier status) para export CSV."""
    return get_ra_pe_proposals(carrera=carrera, limit=10000)


def clear_all_ai_results() -> dict[str, int]:
    """
    Elimina propuestas IA, votos e historial de jobs.
    No toca datos curriculares (Excel) ni usuarios/auth.
    """
    conn = _conn()
    n_votes = conn.execute("SELECT COUNT(*) FROM ai_votes").fetchone()[0]
    n_conex = conn.execute("SELECT COUNT(*) FROM ai_ra_pe_proposals").fetchone()[0]
    n_red = conn.execute("SELECT COUNT(*) FROM ai_redundancy_proposals").fetchone()[0]
    n_jobs = conn.execute("SELECT COUNT(*) FROM ai_jobs").fetchone()[0]
    conn.execute("DELETE FROM ai_votes")
    conn.execute("DELETE FROM ai_ra_pe_proposals")
    conn.execute("DELETE FROM ai_redundancy_proposals")
    conn.execute("DELETE FROM ai_jobs")
    conn.commit()
    conn.close()
    return {
        "votes": n_votes,
        "conexiones": n_conex,
        "redundancia": n_red,
        "jobs": n_jobs,
    }
