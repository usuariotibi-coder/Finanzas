# Sistema de Finanzas para Viaticos (Frontend)

Este proyecto es un frontend en React + Vite para un sistema interno de finanzas, viaticos, conciliacion, AMEX, flotilla y viajes. La app usa datos mock y, en algunos casos, guarda datos en `localStorage` (por ejemplo, proyectos). El backend vive en `backend/` y expone API REST con sesiones.

## Como correrlo local

```powershell
cd "c:\Users\usuar\OneDrive - CEC Controls\Escritorio\Finanzas_v2\frontend"
npm install
npm run dev
```

Luego abre `http://localhost:5173` en tu navegador.

Si quieres apuntar a un backend local:

```bash
VITE_API_URL=http://localhost:8000
```

Puedes agregarlo en `.env` del frontend.

## Modulos y pantallas

Rutas principales definidas en `frontend/src/App.tsx`:

- `/` Dashboard: resumen con metricas y actividad reciente.
- `/login` Inicio de sesion (usa sesiones).
- `/registro` Registro de usuario (elige departamento y puesto).
- `/proyectos` Proyectos: CRUD en local (usa `localStorage`).
- `/viaticos` Viaticos (admin/finanzas): listado, filtros y modales de status.
- `/dispersion` Dispersion: confirma pagos, integra link externo a Efectifintech.
- `/recuperacion` Recuperacion: recupera saldos no usados.
- `/conciliacion` Conciliacion: valida facturas, cruza consumos y AMEX, alertas.
- `/amex` AMEX: tickets, clasificacion contable y exportacion a Excel.
- `/flotilla` Flotilla: vehiculos, asignaciones, mantenimiento y gasolina.
- `/viajes` Viajes: solicitudes de vuelo, camion y hotel.
- `/reportes` Reportes: generacion y descarga de reportes.
- `/mi-portal` Mi Portal (usuario final): solicita viaticos, sube gastos y pide viajes.
- `/portal-pm` Portal PM: aprueba viaticos y viajes, ve proyectos.

## Paso a paso de lo que hace la app

Flujo general del negocio (simulado con datos mock):

1. Usuario crea solicitud de viatico
   - Ir a `Mi Portal` (`/mi-portal`).
   - Seleccionar proyecto, actividad y datos del viaje.
   - Se genera una solicitud con status `pendiente`.

2. Project Manager revisa y aprueba
   - Ir a `Portal PM` (`/portal-pm`).
   - Abrir viatico pendiente y aprobar o rechazar.
   - Si se aprueba, queda listo para dispersion.

3. Finanzas realiza la dispersion
   - Ir a `Dispersion` (`/dispersion`).
   - Ver viaticos aprobados y confirmar pago.
   - El status pasa a `dispersado` o `en_viaje`.

4. Usuario carga gastos y facturas
   - Volver a `Mi Portal` (`/mi-portal`).
   - Subir PDF/XML o tickets y asociarlos al viatico.
   - Se simula el envio de documentos.

5. Conciliacion de facturas
   - Ir a `Conciliacion` (`/conciliacion`).
   - Revisar validacion CFDI, alertas y match con consumos.
   - Iniciar cuadre manual si no hay match.

6. Recuperacion de saldos
   - Ir a `Recuperacion` (`/recuperacion`).
   - Registrar devoluciones de saldo no usado.
   - Cierra el ciclo del viatico.

7. AMEX y reportes
   - `AMEX` (`/amex`) muestra consumos, clasifica cuentas y exporta Excel.
   - `Reportes` (`/reportes`) genera reportes mensuales y por modulo.

8. Flotilla y viajes (servicios internos)
   - `Flotilla` (`/flotilla`) administra vehiculos, mantenimiento y gasolina.
   - `Viajes` (`/viajes`) gestiona solicitudes y estatus de avion/camion/hotel.

## Persistencia y datos

- Datos mock en los archivos de `frontend/src/pages/**`.
- Proyectos guardados en `localStorage` con llave `proyectos_data`.
- Asignaciones de vehiculos en `localStorage` con llave `vehicle_assignments_data` (compartido entre Flotilla y Mi Portal).
- Cuando se actualiza `vehicle_assignments_data` se emite el evento `app-storage-change` para refrescar otras pantallas.
- Exportaciones a Excel en AMEX y Flotilla con utilidades en `frontend/src/utils/exportExcel`.

## Estructura rapida

- `frontend/src/App.tsx`: rutas y layout.
- `frontend/src/pages/**`: pantallas principales.
- `frontend/src/components/**`: UI reutilizable.
- `frontend/src/data/**`: catalogos (cuentas, tarjetas, actividades).
- `frontend/src/utils/**`: helpers (exportacion, clasificador contable).

## Notas importantes

- Autenticacion por sesiones con Django (CSRF + cookies). El front usa `VITE_API_URL`.
- La mayoria de acciones siguen simuladas (alertas, guardados, aprobaciones).
- Roles en frontend:
  - Admin (Finanzas): todas las pantallas.
  - Project Manager: Dashboard, Mi Portal, Portal PM, Proyectos, Viaticos, Conciliacion.
  - Otros departamentos: Dashboard, Mi Portal, Viaticos, Conciliacion.

## Comportamiento clave (UI)

- Validaciones: los modales muestran errores por campo (borde rojo, fondo suave y mensaje debajo). Si falta un dato, se marca el campo correspondiente.
- Flotilla:
  - Asignaciones usan estados `solicitado`, `asignado`, `activo` y `completado`.
  - Finalizar asignacion pide KM final, checklist y foto; al guardar, el estado pasa a `completado` y el vehiculo vuelve a disponible en el tablero.
  - La lista de asignaciones muestra primero las pendientes/activas y al final las finalizadas.
- Viajes:
  - En Detalles de Solicitud se puede actualizar el estado general, notas del administrador y el estatus de avion/camion/hotel.
  - Se pueden agregar y editar confirmaciones de servicios y guardar cambios desde el modal.

