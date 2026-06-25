# Trace Analytics

Herramienta de análisis curricular para la Facultad de Ingeniería de la Universidad de los Andes.

- **Backend:** FastAPI (Docker) en Render Free
- **Frontend:** Next.js (React) en Vercel
- **IA:** Groq (Taula + análisis batch de conexiones y redundancia)
- **Datos:** Excel curriculares en `data/` (incluidos en la imagen Docker)

---

## Estructura del Proyecto

```
├── backend/          # API FastAPI + Dockerfile
├── frontend/         # App Next.js
├── data/             # Excel curriculares (incluidos en el repo)
└── docker-compose.yml  # Entorno local
```

---

## Deploy en Producción (Render Free + Vercel)

### Orden

1. Push a GitHub
2. Backend en Render (Web Service manual, Docker)
3. Frontend en Vercel con la URL del backend
4. Actualizar `ALLOWED_ORIGINS` en Render con la URL de Vercel → redeploy

---

### 1. Backend — Render Free (manual, sin Blueprint ni disco)

1. Render → tu Web Service existente (o **New → Web Service**)
2. Conectar el repo de GitHub
3. Configuración:

| Campo | Valor |
|---|---|
| **Environment** | Docker |
| **Dockerfile Path** | `backend/Dockerfile` |
| **Docker Context** | `.` (raíz del repo) |
| **Instance Type** | Free |

4. Variables de entorno (solo estas son obligatorias en producción):

| Variable | Valor |
|---|---|
| `GROQ_API_KEY` | Tu key de [console.groq.com](https://console.groq.com) |
| `SECRET_KEY` | String aleatorio largo |
| `ALLOWED_ORIGINS` | `https://<tu-app>.vercel.app` |
| `GROQ_MAX_WORKERS` | `2` (opcional) |

`DATA_PATH` y `APP_DB` **no hace falta definirlos**: el Dockerfile usa `/app/data/...`.

> **Limitación del plan Free:** el filesystem es efímero. `app.db` (usuarios, historial, resultados IA) se reinicia en cada redeploy o restart del servicio. Los Excel sí persisten porque van dentro de la imagen Docker.

5. **Manual Deploy** → verificar en `https://<servicio>.onrender.com/docs`

Usuarios seed (se crean al primer arranque):

| Email | Contraseña |
|---|---|
| `vcuevas@miuandes.cl` | `admin123` |
| `jjcuevas@miuandes.cl` | `admin123` |

---

### 2. Frontend — Vercel

| Campo | Valor |
|---|---|
| **Root Directory** | `frontend` |
| **Framework** | Next.js |

Variable de entorno:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://<servicio>.onrender.com` |

Redeploy tras cambiar la variable (se embebe en el build).

---

### 3. CORS

Actualizar `ALLOWED_ORIGINS` en Render con la URL exacta de Vercel y redeploy del backend.

---

## Desarrollo Local con Docker

```bash
docker compose build
docker compose up -d
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Docs API: http://localhost:8000/docs

Variables locales: copiar `backend/.env.example` → `backend/.env`.

---

## Variables de Entorno — Referencia

Ver `backend/.env.example`.
