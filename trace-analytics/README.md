# Trace Analytics

Herramienta de análisis curricular para la Facultad de Ingeniería de la Universidad de los Andes.

- **Backend:** FastAPI (Python) en Render
- **Frontend:** Next.js (React) en Vercel
- **IA:** Groq (Taula + análisis batch de conexiones y redundancia)
- **Datos:** Excel curriculares en `data/` + SQLite (`app.db`) en disco persistente

---

## Estructura del Proyecto

```
trace-analytics/
├── backend/          # API FastAPI
│   ├── main.py       # App principal + todos los endpoints
│   ├── auth_db.py    # Usuarios y JWT
│   ├── ai_db.py      # Jobs y propuestas IA
│   ├── ai_engine.py  # Motor de análisis batch (Groq + TF-IDF)
│   ├── ai_prompts.py # Prompts para Groq
│   ├── matriz_parser.py  # Parseo de matrices de tributación
│   ├── manage.py     # CLI para gestión de usuarios
│   ├── requirements.txt
│   └── .env.example
├── frontend/         # App Next.js
│   ├── app/          # App Router (login, dashboard, páginas)
│   ├── components/   # Componentes UI
│   ├── lib/          # api.ts, auth.ts
│   └── vercel.json
├── data/             # Excel curriculares (incluidos en el repo)
├── docker-compose.yml  # Entorno local completo
└── render.yaml       # Configuración IaC para Render
```

---

## Deploy en Producción

### Orden recomendado

1. Deploy del backend en Render
2. Deploy del frontend en Vercel con la URL del backend
3. Actualizar `ALLOWED_ORIGINS` en Render con la URL de Vercel y redeploy

---

### 1. Backend — Render

Render detecta automáticamente `render.yaml` en la raíz del repo.

**Pasos:**

1. Crear nuevo servicio en Render apuntando al repositorio.
2. Render usará `render.yaml` (`rootDir: backend`, runtime Python).
3. Añadir las siguientes variables de entorno en Render (las marcadas `sync: false` requieren valor manual):

| Variable | Valor |
|---|---|
| `GROQ_API_KEY` | Obtener en [console.groq.com](https://console.groq.com) |
| `GROQ_MAX_WORKERS` | `2` (ya está en render.yaml) |
| `SECRET_KEY` | Auto-generada por Render (`generateValue: true`) |
| `ALLOWED_ORIGINS` | `https://<tu-app>.vercel.app` |
| `DATA_PATH` | Ya definida en render.yaml |
| `APP_DB` | Ya definida en render.yaml |

4. Render crea automáticamente un disco persistente de 1 GB montado en `/data` (ver `render.yaml`). El `app.db` se guarda ahí y sobrevive redeploys.

**Después del primer deploy**, cambiar las contraseñas de los usuarios seed:

```bash
# Desde local, conectado al Render shell o run one-off:
python manage.py reset-password <email>
```

---

### 2. Frontend — Vercel

1. Importar el repositorio en Vercel.
2. Configurar:
   - **Root Directory:** `frontend`
   - **Framework:** Next.js (auto-detectado)
3. Añadir variable de entorno en Vercel:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://trace-analytics-api.onrender.com` (URL del paso anterior) |

4. Deploy. Vercel hace `npm run build` y sirve la app.

---

### 3. CORS

Una vez obtenida la URL de Vercel (ej. `https://trace-analytics.vercel.app`), actualizar `ALLOWED_ORIGINS` en Render y hacer redeploy del backend.

---

## Desarrollo Local con Docker

```bash
# Desde la raíz del proyecto
docker compose build
docker compose up -d
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Docs API: http://localhost:8000/docs

Variables de entorno locales: crear `backend/.env` copiando `backend/.env.example`.

---

## Variables de Entorno — Referencia Completa

Ver `backend/.env.example` para descripción de cada variable.
