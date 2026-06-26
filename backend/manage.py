"""
Administración de usuarios (uso local del equipo).

Ejemplos:
    python manage.py list
    python manage.py set-email francisca@cliente.cl francisca.real@empresa.cl
    python manage.py reset-password sebastian@cliente.cl
    python manage.py set-name sebastian@cliente.cl "Sebastián Pérez"

Sirve sobre todo para fijar los correos reales de Francisca y Sebastián cuando se
conozcan, sin perder su historial.
"""
import sys

import auth_db


def _print_users():
    conn = auth_db._conn()
    rows = conn.execute("SELECT email, name, role, last_login FROM users ORDER BY created_at").fetchall()
    conn.close()
    print(f"{'CORREO':<32} {'NOMBRE':<14} {'ROL':<6} ÚLTIMO INGRESO")
    for r in rows:
        print(f"{r['email']:<32} {r['name']:<14} {r['role']:<6} {r['last_login'] or '—'}")


def main():
    auth_db.init_db()
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return

    cmd = args[0]
    if cmd == "list":
        _print_users()
    elif cmd == "set-email" and len(args) == 3:
        old, new = args[1].strip().lower(), args[2].strip().lower()
        conn = auth_db._conn()
        if not conn.execute("SELECT 1 FROM users WHERE email=?", (old,)).fetchone():
            print(f"No existe el usuario {old}"); conn.close(); return
        conn.execute("UPDATE users SET email=? WHERE email=?", (new, old))
        conn.commit(); conn.close()
        print(f"Correo actualizado: {old} → {new}")
    elif cmd == "set-name" and len(args) == 3:
        email, name = args[1].strip().lower(), args[2]
        conn = auth_db._conn()
        conn.execute("UPDATE users SET name=? WHERE email=?", (name, email))
        conn.commit(); conn.close()
        print(f"Nombre actualizado para {email}: {name}")
    elif cmd == "reset-password" and len(args) == 2:
        import getpass
        email = args[1].strip().lower()
        if not auth_db.get_user(email):
            print(f"No existe el usuario {email}"); return
        pwd = getpass.getpass("Nueva contraseña: ")
        if len(pwd) < 8:
            print("Mínimo 8 caracteres."); return
        conn = auth_db._conn()
        conn.execute("UPDATE users SET password_hash=? WHERE email=?", (auth_db.hash_password(pwd), email))
        conn.commit(); conn.close()
        print(f"Contraseña actualizada para {email}")
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
