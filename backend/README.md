# Backend (Django + Postgres)

## Requisitos

- Python 3.10+
- Postgres

## Instalacion

```powershell
cd "c:\Users\usuar\OneDrive - CEC Controls\Escritorio\Finanzas_v2"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Variables de entorno

Copia `.env.example` y ajusta los valores.

## Migraciones

```powershell
cd backend
python manage.py migrate
python manage.py createsuperuser
```

## Levantar servidor

```powershell
cd backend
python manage.py runserver 0.0.0.0:8000
```

## Endpoints principales

- `api/auth/*` sesiones, login, registro, logout
- `api/proyectos` CRUD proyectos
- `api/viaticos` CRUD viaticos
- `api/dispersiones`, `api/recuperaciones`
- `api/conciliacion/*`, `api/amex/*`
- `api/flotilla/*`
- `api/viajes`
- `api/dashboard/metrics`
- `api/health/`

## Despliegue en Railway

1) Crear proyecto en Railway y conectar el repo.

2) Agregar plugin de Postgres (Railway crea `DATABASE_URL` automaticamente).

3) Variables de entorno recomendadas:

```
DJANGO_SECRET_KEY=tu_llave_secreta
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=*.railway.app
DJANGO_SECURE_COOKIES=true
DJANGO_COOKIE_SAMESITE=None
CORS_ALLOWED_ORIGINS=https://TU_DOMINIO_FRONTEND
CSRF_TRUSTED_ORIGINS=https://TU_DOMINIO_FRONTEND
```

Notas:
- `DATABASE_URL` lo crea Railway cuando agregas Postgres.
- Si usas dominio personalizado, agregalo en `DJANGO_ALLOWED_HOSTS`.

4) Railway ejecuta el start command definido en `railway.toml` o `Procfile`:

```
cd backend && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
```

5) Correr migraciones y crear superusuario en Railway:

```
python backend/manage.py migrate
python backend/manage.py createsuperuser
```

6) Si deployas el frontend por separado, recuerda configurar:

```
VITE_API_URL=https://TU_BACKEND.railway.app
```
