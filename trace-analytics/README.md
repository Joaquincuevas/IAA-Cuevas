# Trace Analytics — Ejecutar con Docker

Instrucciones rápidas para levantar la aplicación (backend FastAPI + frontend Next.js) usando Docker Compose.

Requisitos
- Docker (Engine) instalado
- Docker Compose (v2 integrada en Docker Desktop o `docker compose` disponible)

Archivos importantes
- `docker-compose.yml` — orquesta `backend` y `frontend`
- `frontend` y `backend` — carpetas con cada servicio

Pasos básicos

1. Desde la raíz del proyecto `trace-analytics`, construir y levantar en modo desacoplado:

```bash
cd trace-analytics
docker compose build
docker compose up -d
```

2. Comprobar estado de los contenedores:

```bash
docker compose ps
docker compose logs -f frontend
docker compose logs -f backend
```

Variables de entorno
- `NEXT_PUBLIC_API_BASE_URL`: URL base que usa el frontend para llamar al API (por defecto `http://localhost:8000` cuando se ejecuta localmente con compose).
- `DATA_PATH` (Está definido en `docker-compose.yml`): ruta al archivo Excel con los datos (ej. `./data/RA_UandesFunctional.xlsx`). Asegúrate de que el archivo de datos esté en la ruta que monta el contenedor.

Endpoints útiles
- Frontend: http://localhost:3000 (interfaz Next.js)
- Backend (FastAPI): http://localhost:8000
- Docs de API: http://localhost:8000/docs


Parar y remover contenedores

```bash
docker compose down
```

Forzar rebuild (cuando cambias dependencias o Dockerfile)

```bash
docker compose build --no-cache
docker compose up -d
```

Tips de desarrollo
- Si editas el backend asegúrate de reiniciar el servicio con `docker compose up -d backend` o reinicia todos los servicios.
- Si el frontend no refleja cambios de TypeScript/Next, reconstruye la imagen o ejecuta el frontend localmente fuera de Docker para desarrollo rápido.

Soporte
Si necesitas que adapte el `docker-compose.yml` (p. ej. montar volumenes distintos, añadir servicios o variables de entorno), dime exactamente qué quieres y lo añado.