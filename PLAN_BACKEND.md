# Plan de Implementación: Backend para Sistema de Finanzas

## Resumen Ejecutivo

**Recomendación: Iniciar backend inmediatamente** con enfoque de MVP incremental.

Dada la urgencia (necesidad de demostrar funcionalidad pronto) y que todos los módulos son críticos, implementaremos el backend en 3 fases priorizadas que permitan tener un sistema funcional end-to-end rápidamente.

---

## Stack Tecnológico

### Backend Core
- **Node.js + TypeScript + Express**
  - Reutilización directa de los 500+ líneas de tipos del frontend
  - Velocidad de desarrollo máxima
  - Curva de aprendizaje mínima

### Base de Datos
- **PostgreSQL 15+**
  - ACID compliance (crítico para transacciones financieras)
  - Soporte JSON nativo para campos complejos
  - Escalable para millones de registros

### Autenticación
- **JWT + Refresh Tokens**
  - Roles: admin, finanzas, gerente_servicios, program_manager, usuario

### File Storage
- **AWS S3** (o compatible local para desarrollo)
  - XMLs/PDFs de facturas
  - Fotos de vehículos y odómetros

---

## Estructura del Proyecto Backend

```
backend/
├── src/
│   ├── config/           # Database, Redis, Storage, Environment
│   ├── types/            # TIPOS COMPARTIDOS con frontend
│   ├── models/           # Modelos de BD (TypeORM/Prisma)
│   ├── middleware/       # Auth, roleCheck, validation, errorHandler
│   ├── routes/           # Rutas por módulo (12 archivos)
│   ├── controllers/      # Controladores por módulo
│   ├── services/         # Lógica de negocio
│   ├── utils/            # xmlParser, excelGenerator, validators
│   ├── database/         # Migrations y seeds
│   └── server.ts
├── tests/
├── .env.example
├── package.json
└── docker-compose.yml
```

---

## Esquema de Base de Datos

### Tablas Principales (18 tablas)

1. **users** - Usuarios con roles
2. **proyectos** - Proyectos con presupuestos
3. **viaticos** - Solicitudes de viáticos (flujo completo)
4. **dispersiones** - Registro de pagos
5. **recuperaciones** - Recuperación de saldos
6. **facturas** - Facturas con CFDI
7. **tickets_amex** - Gastos corporativos
8. **tarjetas_amex** - Catálogo de tarjetas
9. **vehicles** - Vehículos de flotilla
10. **vehicle_assignments** - Asignaciones de vehículos
11. **vehicle_expenses** - Gastos de vehículos
12. **vehicle_alerts** - Alertas de mantenimiento
13. **conciliaciones** - Períodos de conciliación
14. **solicitudes_viaje** - Avión/hotel/camión
15. **notifications** - Notificaciones para usuarios
16. **cuentas_contables** - Catálogo contable
17. **patrones_clasificacion** - Datos del ML clasificador
18. **refresh_tokens** - Para autenticación

Ver esquema SQL completo en sección de implementación.

---

## Implementación por Fases

### 🚀 FASE 1 - MVP Funcional (2-3 semanas) - CRÍTICA

**Objetivo**: Sistema funcional end-to-end para demostración

#### Módulos a implementar:

**1. Autenticación (2 días)**
- Login/Logout con JWT
- Refresh tokens
- Middleware de autorización por roles
- Endpoint `/api/auth/me`

**2. Proyectos (2 días)**
- CRUD completo
- Migración de datos desde localStorage del frontend
- Endpoints:
  - `GET/POST /api/proyectos`
  - `GET/PUT/DELETE /api/proyectos/:id`

**3. Viáticos - Flujo Completo (5 días)** ⭐ MÁS CRÍTICO
- Creación de solicitudes por usuarios
- Aprobación/rechazo por PM
- Cambios de status (8 estados diferentes)
- Vinculación obligatoria con proyectos
- Endpoints:
  - `GET/POST /api/viaticos`
  - `PUT /api/viaticos/:id/aprobar`
  - `PUT /api/viaticos/:id/rechazar`
  - `PUT /api/viaticos/:id/status`
  - `GET /api/viaticos/mis-viaticos`

**4. Dispersiones (3 días)**
- Registro de dispersiones de viáticos aprobados
- Daily report
- Confirmación de pagos
- Integración con Efectifintech (link externo)
- Endpoints:
  - `GET/POST /api/dispersiones`
  - `PUT /api/dispersiones/:id/confirmar`
  - `GET /api/dispersiones/daily-report`

**5. Dashboard Básico (2 días)**
- Métricas principales (totales)
- Actividad reciente
- Endpoint: `GET /api/reportes/dashboard`

**Complejidad**: Media | **Riesgo**: Bajo | **Valor**: MUY ALTO

---

### 📊 FASE 2 - Conciliación y AMEX (2-3 semanas)

**Objetivo**: Automatización de procesos financieros

#### Módulos a implementar:

**1. AMEX (4 días)**
- Importación de tickets (CSV)
- Migración del clasificador automático desde frontend
- Exportación a Excel
- Detección de duplicados
- Vinculación con proyectos (obligatorio para cuenta 5450)
- Endpoints clave:
  - `POST /api/amex/import`
  - `PUT /api/amex/tickets/:id/clasificar`
  - `GET /api/amex/export`

**2. Facturas (4 días)**
- Upload de XML/PDF
- Parser de CFDI (SAT)
- Validación automática
- Storage de archivos (S3/local)
- Endpoints:
  - `POST /api/facturas/upload`
  - `PUT /api/facturas/:id/validar`
  - `GET /api/facturas/:id/download/:type`

**3. Conciliación (5 días)**
- Matching automático facturas ↔ consumos
- Detección de discrepancias
- Sistema de alertas (5 tipos)
- Reportes de conciliación
- Endpoints:
  - `POST /api/conciliacion/iniciar`
  - `PUT /api/conciliacion/:id/match`
  - `GET /api/conciliacion/:id/alertas`

**4. Recuperaciones (2 días)**
- Registro de recuperaciones
- Cálculo de días sin recuperar
- Alertas automáticas
- Endpoints:
  - `GET/POST /api/recuperaciones`
  - `GET /api/recuperaciones/pendientes`

**Complejidad**: Alta | **Riesgo**: Medio | **Valor**: ALTO

---

### 🚗 FASE 3 - Flotilla y Complementos (2 semanas)

**Objetivo**: Gestión completa de vehículos y viajes

#### Módulos a implementar:

**1. Flotilla - Vehículos (3 días)**
- CRUD de vehículos
- Upload de fotos
- Información de seguro/mantenimiento
- Estados: disponible, asignado, en taller, baja

**2. Flotilla - Asignaciones (3 días)**
- Asignación a usuarios/viáticos
- Checklists de condición (JSON)
- Fotos de odómetro (inicial/final)
- Tracking de kilometraje

**3. Flotilla - Mantenimiento (2 días)**
- Alertas automáticas por tipo
- Registro de gastos
- Historial de mantenimiento
- Vinculación con facturas

**4. Viajes (2 días)**
- Solicitudes de avión/hotel/camión
- Workflow de confirmaciones
- Estados por servicio

**5. Reportes Avanzados (2 días)**
- Generación de Excel (múltiples sheets)
- Reportes contables mensuales
- Exportación masiva

**Complejidad**: Media-Alta | **Riesgo**: Bajo | **Valor**: MEDIO-ALTO

---

## Archivos Críticos del Frontend a Revisar

Estos archivos contienen la "fuente de verdad" que debe replicarse en el backend:

1. **frontend/src/types/index.ts**
   - 500+ líneas de tipos TypeScript
   - TODOS los interfaces y enums del sistema
   - **Acción**: Compartir directamente con backend

2. **frontend/src/utils/clasificadorContable.ts**
   - Lógica del clasificador ML (keywords-based)
   - Sistema de aprendizaje de patrones
   - **Acción**: Migrar al backend como servicio

3. **frontend/src/data/cuentasContables.ts**
   - Catálogo completo de cuentas contables
   - Keywords por cuenta
   - **Acción**: Convertir en seed data para BD

4. **frontend/src/pages/viaticos/Viaticos.tsx**
   - Flujo completo de viáticos
   - 8 estados diferentes
   - Workflow de aprobación
   - **Acción**: Replicar lógica en ViaticoService

5. **frontend/src/pages/amex/Amex.tsx**
   - Clasificación automática
   - Detección de duplicados
   - Exportación a Excel
   - **Acción**: Replicar en AmexService

6. **frontend/src/data/tarjetasAMEX.ts**
   - Catálogo de tarjetas corporativas
   - **Acción**: Seed data para BD

7. **frontend/src/data/gsActivities.ts**
   - Actividades de GS (catálogo)
   - **Acción**: Seed data para BD

---

## Estrategia de Migración de Datos

### Desde localStorage/Mock → Base de Datos

**Enfoque**:
1. Crear endpoint temporal de migración
2. Frontend envía batch de datos actuales
3. Backend valida e inserta en transacción

```typescript
POST /api/migration/import
Body: {
  proyectos: Proyecto[],
  viaticos: Viatico[],
  users: User[]
}

Response: {
  success: boolean,
  migrated: { proyectos: number, viaticos: number, users: number },
  errors: string[]
}
```

---

## Control de Acceso por Rol

```typescript
PERMISSIONS = {
  'admin': ['*'],  // Acceso total

  'finanzas': [
    'viaticos:approve', 'dispersiones:create',
    'facturas:*', 'amex:*', 'conciliacion:*'
  ],

  'gerente_servicios': [
    'viaticos:approve', 'flotilla:*', 'viajes:*'
  ],

  'program_manager': [
    'proyectos:*', 'viaticos:approve', 'reportes:read'
  ],

  'usuario': [
    'viaticos:create', 'viaticos:read:own',
    'flotilla:request', 'viajes:create'
  ]
}
```

---

## Clasificador ML de AMEX

### Enfoque Incremental:

**MVP (Fase 1)**: Keywords-based
- Migrar `clasificadorContable.ts` al backend
- Base de datos de patrones aprendidos
- API retorna sugerencia con nivel de confianza

**Fase 2**: ML básico con TensorFlow.js
- Modelo simple de clasificación
- Entrena con datos históricos

**Futuro**: Microservicio Python
- scikit-learn para modelos avanzados
- NLP para análisis de texto

---

## Configuración Inicial

### Variables de Entorno

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/finanzas_db

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# AWS S3 (o local)
S3_BUCKET=finanzas-uploads
S3_REGION=us-east-1

# App
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

### Docker Compose

```yaml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: finanzas_db
      POSTGRES_USER: finanzas
      POSTGRES_PASSWORD: changeme
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
```

---

## Endpoints Principales - Fase 1 (MVP)

### Autenticación
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Usuario actual

### Proyectos
- `GET /api/proyectos` - Listar (con filtros)
- `POST /api/proyectos` - Crear
- `GET /api/proyectos/:id` - Obtener
- `PUT /api/proyectos/:id` - Actualizar
- `DELETE /api/proyectos/:id` - Eliminar

### Viáticos (CORE)
- `GET /api/viaticos` - Listar (filtros: status, user, proyecto)
- `POST /api/viaticos` - Crear solicitud
- `GET /api/viaticos/:id` - Obtener
- `PUT /api/viaticos/:id` - Actualizar
- `PUT /api/viaticos/:id/aprobar` - Aprobar (PM/Admin)
- `PUT /api/viaticos/:id/rechazar` - Rechazar
- `PUT /api/viaticos/:id/status` - Cambiar status
- `GET /api/viaticos/mis-viaticos` - Del usuario actual

### Dispersiones
- `GET /api/dispersiones` - Listar
- `POST /api/dispersiones` - Registrar dispersión
- `PUT /api/dispersiones/:id/confirmar` - Confirmar
- `GET /api/dispersiones/daily-report` - Reporte diario

### Dashboard
- `GET /api/reportes/dashboard` - Métricas principales

### Usuarios
- `GET /api/users` - Listar (Admin/Finanzas)
- `POST /api/users` - Crear (Admin)
- `GET /api/users/:id` - Obtener
- `PUT /api/users/:id` - Actualizar

---

## Timeline Estimado

### Con 1 desarrollador full-time:
- **Fase 1 (MVP)**: 2-3 semanas
- **Fase 2 (AMEX/Conciliación)**: 2-3 semanas
- **Fase 3 (Flotilla)**: 2 semanas

**Total**: 6-8 semanas para sistema completo

### Aceleradores:
- Tipos TypeScript ya definidos (ahorra 1 semana)
- UI completa en frontend (no hay diseño que esperar)
- Lógica de negocio ya implementada en frontend (referencia clara)

---

## Próximos Pasos Inmediatos

1. **Crear proyecto backend** con estructura de carpetas
2. **Configurar TypeScript** y compartir tipos con frontend
3. **Setup PostgreSQL** con docker-compose
4. **Implementar autenticación** (JWT + roles)
5. **Migrar módulo de Proyectos** (más simple, para validar arquitectura)
6. **Implementar Viáticos** (módulo más crítico)
7. **Conectar frontend** con API real

---

## Riesgos y Mitigaciones

### Riesgo: Parser de CFDI complejo
**Mitigación**: Usar librería existente (`cfdi-parser` o similar) en Fase 2

### Riesgo: Matching automático en conciliación
**Mitigación**: Empezar con matching simple (UUID/folio exacto), mejorar después

### Riesgo: Upload de archivos grandes
**Mitigación**: Límite de 10MB, procesamiento asíncrono con colas (Redis)

### Riesgo: Sobrecarga de scope
**Mitigación**: MVP estricto en Fase 1, no agregar features "nice to have"

---

## Recomendación Final

✅ **INICIAR BACKEND INMEDIATAMENTE** con Fase 1

El frontend está suficientemente maduro (85% UI, 60% lógica) para servir como especificación funcional completa. Los detalles pendientes del frontend se pueden pulir en paralelo mientras avanza el backend.

**Prioridad #1**: Tener el flujo completo de Viáticos funcionando end-to-end (solicitud → aprobación → dispersión → recuperación) en 2-3 semanas.

Esto demostrará valor inmediato y permitirá iterar sobre el resto de módulos con confianza.

---

## Esquema SQL Detallado

```sql
-- 1. USUARIOS Y AUTENTICACIÓN
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'finanzas', 'gerente_servicios', 'usuario', 'program_manager')),
    department VARCHAR(100),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- 2. PROYECTOS
CREATE TABLE proyectos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    cliente VARCHAR(255) NOT NULL,
    estado VARCHAR(50) NOT NULL CHECK (estado IN ('activo', 'en_pausa', 'completado', 'cancelado')),
    presupuesto DECIMAL(12, 2) NOT NULL DEFAULT 0,
    gastado DECIMAL(12, 2) NOT NULL DEFAULT 0,
    fecha_inicio DATE NOT NULL,
    fecha_fin_estimada DATE NOT NULL,
    fecha_fin_real DATE,
    responsable VARCHAR(255) NOT NULL,
    departamento VARCHAR(100) NOT NULL,
    descripcion TEXT,
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_proyectos_codigo ON proyectos(codigo);
CREATE INDEX idx_proyectos_estado ON proyectos(estado);
CREATE INDEX idx_proyectos_cliente ON proyectos(cliente);

-- 3. VIÁTICOS
CREATE TABLE viaticos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    proyecto_id UUID NOT NULL REFERENCES proyectos(id),
    gs_activity_id INTEGER,
    motivo TEXT NOT NULL,
    destino VARCHAR(255) NOT NULL,
    destino_pais VARCHAR(50) NOT NULL CHECK (destino_pais IN ('Mexico', 'USA', 'Otro')),
    tipo_viatico VARCHAR(50) NOT NULL CHECK (tipo_viatico IN ('efectifintech', 'amex', 'mixto')),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    fecha_inicio_real DATE,
    fecha_fin_real DATE,
    monto_solicitado DECIMAL(10, 2) NOT NULL,
    monto_aprobado DECIMAL(10, 2),
    monto_dispersado DECIMAL(10, 2),
    monto_gastado DECIMAL(10, 2),
    saldo_restante DECIMAL(10, 2),
    status VARCHAR(50) NOT NULL CHECK (status IN ('pendiente', 'aprobado', 'rechazado', 'dispersado', 'en_viaje', 'viaje_finalizado', 'en_recuperacion', 'completado')),
    vehiculo_asignado VARCHAR(50),
    aprobado_por UUID REFERENCES users(id),
    comentarios TEXT,
    dias_sin_recuperar INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_viaticos_user_id ON viaticos(user_id);
CREATE INDEX idx_viaticos_proyecto_id ON viaticos(proyecto_id);
CREATE INDEX idx_viaticos_status ON viaticos(status);
CREATE INDEX idx_viaticos_fecha_inicio ON viaticos(fecha_inicio);

-- 4. DISPERSIONES
CREATE TABLE dispersiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viatico_id UUID NOT NULL REFERENCES viaticos(id) ON DELETE CASCADE,
    monto DECIMAL(10, 2) NOT NULL,
    fecha DATE NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL CHECK (metodo_pago IN ('transferencia', 'efectivo', 'tarjeta')),
    referencia VARCHAR(100),
    confirmado BOOLEAN DEFAULT false,
    dispersado_por UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dispersiones_viatico_id ON dispersiones(viatico_id);
CREATE INDEX idx_dispersiones_fecha ON dispersiones(fecha);

-- 5. RECUPERACIONES
CREATE TABLE recuperaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viatico_id UUID NOT NULL REFERENCES viaticos(id) ON DELETE CASCADE,
    monto_recuperado DECIMAL(10, 2) NOT NULL,
    fecha DATE NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL CHECK (metodo_pago IN ('transferencia', 'efectivo', 'tarjeta')),
    referencia VARCHAR(100),
    registrado_por UUID NOT NULL REFERENCES users(id),
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_recuperaciones_viatico_id ON recuperaciones(viatico_id);
CREATE INDEX idx_recuperaciones_fecha ON recuperaciones(fecha);

-- 6. FACTURAS
CREATE TABLE facturas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viatico_id UUID REFERENCES viaticos(id),
    user_id UUID NOT NULL REFERENCES users(id),
    folio VARCHAR(100) NOT NULL,
    uuid VARCHAR(100) UNIQUE NOT NULL,
    rfc VARCHAR(20) NOT NULL,
    razon_social VARCHAR(255) NOT NULL,
    fecha DATE NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    iva DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    forma_pago VARCHAR(50) NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL,
    conceptos JSONB NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pendiente', 'validada', 'rechazada', 'conciliada')),
    archivo_xml TEXT,
    archivo_pdf TEXT,
    validacion_cfdi JSONB,
    match_consumo BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_facturas_viatico_id ON facturas(viatico_id);
CREATE INDEX idx_facturas_user_id ON facturas(user_id);
CREATE INDEX idx_facturas_uuid ON facturas(uuid);
CREATE INDEX idx_facturas_status ON facturas(status);
CREATE INDEX idx_facturas_fecha ON facturas(fecha);

-- 7. TICKETS AMEX
CREATE TABLE tickets_amex (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    card_number VARCHAR(10) NOT NULL,
    card_holder VARCHAR(255) NOT NULL,
    fecha DATE NOT NULL,
    comercio VARCHAR(255) NOT NULL,
    monto DECIMAL(10, 2) NOT NULL,
    monto_usd DECIMAL(10, 2),
    tipo_cambio DECIMAL(6, 4),
    categoria VARCHAR(100) NOT NULL,
    cuenta_contable VARCHAR(10) NOT NULL,
    proyecto_id UUID REFERENCES proyectos(id),
    gs_activity_id INTEGER,
    pais_comercio VARCHAR(50) NOT NULL,
    factura_id UUID REFERENCES facturas(id),
    matched BOOLEAN DEFAULT false,
    autorizado BOOLEAN DEFAULT true,
    duplicado BOOLEAN DEFAULT false,
    clasificacion_auto BOOLEAN DEFAULT false,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tickets_amex_user_id ON tickets_amex(user_id);
CREATE INDEX idx_tickets_amex_proyecto_id ON tickets_amex(proyecto_id);
CREATE INDEX idx_tickets_amex_fecha ON tickets_amex(fecha);
CREATE INDEX idx_tickets_amex_matched ON tickets_amex(matched);
CREATE INDEX idx_tickets_amex_card_number ON tickets_amex(card_number);

-- 8. TARJETAS AMEX
CREATE TABLE tarjetas_amex (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_number VARCHAR(10) UNIQUE NOT NULL,
    card_holder VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 9. VEHÍCULOS
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marca VARCHAR(100) NOT NULL,
    modelo VARCHAR(100) NOT NULL,
    anio INTEGER NOT NULL,
    placas VARCHAR(20) UNIQUE NOT NULL,
    numero_serie VARCHAR(50) UNIQUE NOT NULL,
    color VARCHAR(50) NOT NULL,
    seguro JSONB NOT NULL,
    mantenimiento JSONB NOT NULL,
    km_actual INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL CHECK (status IN ('disponible', 'asignado', 'en_taller', 'baja')),
    foto TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_placas ON vehicles(placas);

-- 10. ASIGNACIONES DE VEHÍCULOS
CREATE TABLE vehicle_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    user_id UUID NOT NULL REFERENCES users(id),
    viatico_id UUID REFERENCES viaticos(id),
    proyecto_id UUID REFERENCES proyectos(id),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    motivo TEXT NOT NULL,
    proposito VARCHAR(50) NOT NULL CHECK (proposito IN ('operaciones', 'visita', 'viaje')),
    km_inicial INTEGER NOT NULL,
    km_final INTEGER,
    foto_odometro_inicial TEXT,
    foto_odometro_final TEXT,
    checklist_recepcion JSONB,
    checklist_entrega JSONB,
    status VARCHAR(50) NOT NULL CHECK (status IN ('solicitado', 'asignado', 'activo', 'completado', 'rechazado')),
    incidentes TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vehicle_assignments_vehicle_id ON vehicle_assignments(vehicle_id);
CREATE INDEX idx_vehicle_assignments_user_id ON vehicle_assignments(user_id);
CREATE INDEX idx_vehicle_assignments_status ON vehicle_assignments(status);

-- 11. GASTOS DE VEHÍCULOS
CREATE TABLE vehicle_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    assignment_id UUID REFERENCES vehicle_assignments(id),
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('gasolina', 'mantenimiento', 'seguro', 'verificacion', 'otro')),
    fecha DATE NOT NULL,
    monto DECIMAL(10, 2) NOT NULL,
    descripcion TEXT NOT NULL,
    factura_id UUID REFERENCES facturas(id),
    odometro INTEGER,
    proveedor VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vehicle_expenses_vehicle_id ON vehicle_expenses(vehicle_id);
CREATE INDEX idx_vehicle_expenses_fecha ON vehicle_expenses(fecha);

-- 12. ALERTAS DE VEHÍCULOS
CREATE TABLE vehicle_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    tipo_mantenimiento VARCHAR(50) NOT NULL CHECK (tipo_mantenimiento IN ('preventivo', 'predictivo', 'correctivo', 'otro')),
    tipo_alerta VARCHAR(50) NOT NULL CHECK (tipo_alerta IN ('servicio', 'seguro', 'verificacion', 'placas', 'reparacion')),
    descripcion TEXT NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    prioridad VARCHAR(20) NOT NULL CHECK (prioridad IN ('alta', 'media', 'baja')),
    costo_estimado DECIMAL(10, 2),
    proveedor_sugerido VARCHAR(255),
    atendido BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vehicle_alerts_vehicle_id ON vehicle_alerts(vehicle_id);
CREATE INDEX idx_vehicle_alerts_atendido ON vehicle_alerts(atendido);
CREATE INDEX idx_vehicle_alerts_prioridad ON vehicle_alerts(prioridad);

-- 13. CONCILIACIONES
CREATE TABLE conciliaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo VARCHAR(10) NOT NULL CHECK (periodo IN ('1-15', '16-30')),
    mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    anio INTEGER NOT NULL,
    facturas INTEGER NOT NULL DEFAULT 0,
    consumos INTEGER NOT NULL DEFAULT 0,
    matched INTEGER NOT NULL DEFAULT 0,
    discrepancias INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL CHECK (status IN ('en_proceso', 'completada', 'revisada')),
    alertas JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_conciliaciones_periodo ON conciliaciones(anio, mes, periodo);
CREATE INDEX idx_conciliaciones_status ON conciliaciones(status);

-- 14. SOLICITUDES DE VIAJE
CREATE TABLE solicitudes_viaje (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    proyecto_id UUID NOT NULL REFERENCES proyectos(id),
    destino VARCHAR(255) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    motivo TEXT NOT NULL,
    necesita_avion BOOLEAN DEFAULT false,
    necesita_camion BOOLEAN DEFAULT false,
    necesita_hotel BOOLEAN DEFAULT false,
    detalles_avion TEXT,
    detalles_camion TEXT,
    detalles_hotel TEXT,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pendiente', 'en_proceso', 'confirmado', 'cancelado', 'completado')),
    status_avion VARCHAR(50) CHECK (status_avion IN ('pendiente', 'gestionando', 'confirmado')),
    status_camion VARCHAR(50) CHECK (status_camion IN ('pendiente', 'gestionando', 'confirmado')),
    status_hotel VARCHAR(50) CHECK (status_hotel IN ('pendiente', 'gestionando', 'confirmado')),
    notas TEXT,
    costo_estimado DECIMAL(10, 2),
    costo_final DECIMAL(10, 2),
    confirmaciones JSONB,
    atendido_por UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_solicitudes_viaje_user_id ON solicitudes_viaje(user_id);
CREATE INDEX idx_solicitudes_viaje_proyecto_id ON solicitudes_viaje(proyecto_id);
CREATE INDEX idx_solicitudes_viaje_status ON solicitudes_viaje(status);

-- 15. NOTIFICACIONES
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('info', 'success', 'warning', 'error')),
    titulo VARCHAR(255) NOT NULL,
    mensaje TEXT NOT NULL,
    leida BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_leida ON notifications(leida);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- 16. CUENTAS CONTABLES
CREATE TABLE cuentas_contables (
    codigo VARCHAR(10) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    proyecto_requerido BOOLEAN DEFAULT false,
    keywords TEXT[],
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 17. PATRONES DE CLASIFICACIÓN ML
CREATE TABLE patrones_clasificacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comercio VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    cuenta_contable VARCHAR(10) NOT NULL REFERENCES cuentas_contables(codigo),
    confianza DECIMAL(3, 2) NOT NULL CHECK (confianza BETWEEN 0 AND 1),
    veces_usado INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_patrones_comercio ON patrones_clasificacion(comercio);
CREATE INDEX idx_patrones_cuenta ON patrones_clasificacion(cuenta_contable);

-- 18. REFRESH TOKENS
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
```