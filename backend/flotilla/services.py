from __future__ import annotations

from datetime import date
import re

from .models import CargaGasolina, MaintenanceRecord, Vehicle, VehicleAlert, VehicleExpense


AUTO_ALERT_PROVIDER = 'AUTO_SYNC'
DEFAULT_GAS_PRICE_PER_LITER = 23


def _normalize_text(value: str) -> str:
    return str(value or '').strip().lower()


def infer_maintenance_type(description: str) -> MaintenanceRecord.Tipo:
    normalized = _normalize_text(description)
    if re.search(r'(aceite|filtro|afinacion|servicio|preventiv)', normalized):
        return MaintenanceRecord.Tipo.PREVENTIVO
    if re.search(r'(vibracion|sensor|bateria|llanta|freno|desgaste|diagnostic)', normalized):
        return MaintenanceRecord.Tipo.PREDICTIVO
    if re.search(r'(reparacion|averia|falla|motor|transmision|suspension|electri)', normalized):
        return MaintenanceRecord.Tipo.CORRECTIVO
    return MaintenanceRecord.Tipo.OTRO


def parse_liters_from_description(description: str) -> float | None:
    match = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:l|lt|lts|litro|litros)\b', str(description or ''), re.IGNORECASE)
    if not match:
        return None
    try:
        parsed = float(match.group(1).replace(',', '.'))
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def _resolve_fuel_odometer(expense: VehicleExpense) -> int:
    if expense.odometro:
        return int(expense.odometro)
    assignment = expense.assignment
    if assignment and assignment.km_final:
        return int(assignment.km_final)
    if assignment and assignment.km_inicial:
        return int(assignment.km_inicial)
    return 0


def _resolve_fuel_efficiency(expense: VehicleExpense, liters: float) -> float | None:
    assignment = expense.assignment
    if not assignment or not assignment.km_inicial or not assignment.km_final or liters <= 0:
        return None
    distance = assignment.km_final - assignment.km_inicial
    if distance <= 0:
        return None
    return round(distance / liters, 2)


def ensure_gasoline_load_from_expense(expense: VehicleExpense) -> CargaGasolina | None:
    if expense.tipo != VehicleExpense.Tipo.GASOLINA:
        return None

    liters = parse_liters_from_description(expense.descripcion)
    if liters is None:
        liters = round(float(expense.monto) / DEFAULT_GAS_PRICE_PER_LITER, 2) if float(expense.monto) > 0 else 0
    price_per_liter = round(float(expense.monto) / liters, 2) if liters > 0 else DEFAULT_GAS_PRICE_PER_LITER
    odometer = _resolve_fuel_odometer(expense)
    efficiency = _resolve_fuel_efficiency(expense, liters)
    station = expense.proveedor or expense.descripcion or 'Gasto de gasolina'
    user = getattr(expense.assignment, 'user', None)

    existing = CargaGasolina.objects.filter(
        vehicle=expense.vehicle,
        assignment=expense.assignment,
        fecha=expense.fecha,
        total=expense.monto,
        estacion=station,
    ).first()
    if existing:
        changed = False
        if float(existing.litros) != float(liters):
            existing.litros = liters
            changed = True
        if float(existing.precio_litro) != float(price_per_liter):
            existing.precio_litro = price_per_liter
            changed = True
        if existing.odometro != odometer:
            existing.odometro = odometer
            changed = True
        if existing.factura_id != expense.factura_id:
            existing.factura_id = expense.factura_id
            changed = True
        if existing.user_id != getattr(user, 'id', None):
            existing.user = user
            changed = True
        current_efficiency = float(existing.eficiencia) if existing.eficiencia is not None else None
        if current_efficiency != efficiency:
            existing.eficiencia = efficiency
            changed = True
        if changed:
            existing.save()
        return existing

    return CargaGasolina.objects.create(
        vehicle=expense.vehicle,
        assignment=expense.assignment,
        user=user,
        fecha=expense.fecha,
        litros=liters,
        precio_litro=price_per_liter,
        total=expense.monto,
        odometro=odometer,
        estacion=station,
        factura_id=expense.factura_id,
        eficiencia=efficiency,
    )


def ensure_maintenance_record_from_expense(expense: VehicleExpense) -> MaintenanceRecord | None:
    if expense.tipo != VehicleExpense.Tipo.MANTENIMIENTO:
        return None

    existing = MaintenanceRecord.objects.filter(
        vehicle=expense.vehicle,
        fecha=expense.fecha,
        descripcion=expense.descripcion,
        costo=expense.monto,
    ).first()
    if existing:
        return existing

    return MaintenanceRecord.objects.create(
        vehicle=expense.vehicle,
        fecha=expense.fecha,
        tipo=infer_maintenance_type(expense.descripcion),
        descripcion=expense.descripcion or 'Mantenimiento registrado',
        costo=expense.monto,
        km=expense.odometro,
        proveedor=expense.proveedor or '',
    )


def ensure_expense_from_gasoline_load(load: CargaGasolina) -> VehicleExpense:
    existing = VehicleExpense.objects.filter(
        vehicle=load.vehicle,
        assignment=load.assignment,
        tipo=VehicleExpense.Tipo.GASOLINA,
        fecha=load.fecha,
        monto=load.total,
        proveedor=load.estacion,
    ).first()
    if existing:
        return existing

    return VehicleExpense.objects.create(
        vehicle=load.vehicle,
        assignment=load.assignment,
        tipo=VehicleExpense.Tipo.GASOLINA,
        fecha=load.fecha,
        monto=load.total,
        descripcion=f'Carga de gasolina - {load.litros} L',
        factura_id=load.factura_id or '',
        odometro=load.odometro,
        proveedor=load.estacion,
    )


def ensure_expense_from_maintenance(record: MaintenanceRecord) -> VehicleExpense:
    existing = VehicleExpense.objects.filter(
        vehicle=record.vehicle,
        tipo=VehicleExpense.Tipo.MANTENIMIENTO,
        fecha=record.fecha,
        monto=record.costo,
        descripcion=record.descripcion,
    ).first()
    if existing:
        return existing

    return VehicleExpense.objects.create(
        vehicle=record.vehicle,
        tipo=VehicleExpense.Tipo.MANTENIMIENTO,
        fecha=record.fecha,
        monto=record.costo,
        descripcion=record.descripcion,
        odometro=record.km,
        proveedor=record.proveedor or '',
    )


def sync_expense_mirrors() -> None:
    for expense in VehicleExpense.objects.select_related('vehicle', 'assignment').all():
        ensure_gasoline_load_from_expense(expense)
        ensure_maintenance_record_from_expense(expense)


def _upsert_auto_alert(
    *,
    vehicle: Vehicle,
    tipo_alerta: VehicleAlert.TipoAlerta,
    tipo_mantenimiento: VehicleAlert.TipoMantenimiento,
    descripcion: str,
    fecha_vencimiento: date,
    prioridad: VehicleAlert.Prioridad,
    costo_estimado=None,
) -> VehicleAlert:
    alert, _ = VehicleAlert.objects.get_or_create(
        vehicle=vehicle,
        tipo_alerta=tipo_alerta,
        proveedor_sugerido=AUTO_ALERT_PROVIDER,
        defaults={
            'tipo_mantenimiento': tipo_mantenimiento,
            'descripcion': descripcion,
            'fecha_vencimiento': fecha_vencimiento,
            'prioridad': prioridad,
            'costo_estimado': costo_estimado,
            'atendido': False,
        },
    )

    changed = False
    if alert.tipo_mantenimiento != tipo_mantenimiento:
        alert.tipo_mantenimiento = tipo_mantenimiento
        changed = True
    if alert.descripcion != descripcion:
        alert.descripcion = descripcion
        changed = True
    if alert.fecha_vencimiento != fecha_vencimiento:
        alert.fecha_vencimiento = fecha_vencimiento
        changed = True
    if alert.prioridad != prioridad:
        alert.prioridad = prioridad
        changed = True
    if alert.costo_estimado != costo_estimado:
        alert.costo_estimado = costo_estimado
        changed = True
    if alert.atendido:
        alert.atendido = False
        changed = True

    if changed:
        alert.save(update_fields=[
            'tipo_mantenimiento',
            'descripcion',
            'fecha_vencimiento',
            'prioridad',
            'costo_estimado',
            'atendido',
        ])

    return alert


def sync_vehicle_alerts() -> None:
    today = date.today()

    for vehicle in Vehicle.objects.all():
        if vehicle.mantenimiento_proximo_servicio or vehicle.mantenimiento_km_proximo:
            target_date = vehicle.mantenimiento_proximo_servicio or today
            km_label = f' a los {vehicle.mantenimiento_km_proximo:,} km' if vehicle.mantenimiento_km_proximo else ''
            description = (
                f'Servicio preventivo programado para {vehicle.marca} {vehicle.modelo} ({vehicle.placas})'
                f'{km_label}.'
            )
            _upsert_auto_alert(
                vehicle=vehicle,
                tipo_alerta=VehicleAlert.TipoAlerta.SERVICIO,
                tipo_mantenimiento=VehicleAlert.TipoMantenimiento.PREVENTIVO,
                descripcion=description,
                fecha_vencimiento=target_date,
                prioridad=VehicleAlert.Prioridad.MEDIA,
            )
        else:
            description = f'Configurar proximo servicio preventivo para {vehicle.marca} {vehicle.modelo} ({vehicle.placas}).'
            _upsert_auto_alert(
                vehicle=vehicle,
                tipo_alerta=VehicleAlert.TipoAlerta.SERVICIO,
                tipo_mantenimiento=VehicleAlert.TipoMantenimiento.PREVENTIVO,
                descripcion=description,
                fecha_vencimiento=today,
                prioridad=VehicleAlert.Prioridad.MEDIA,
            )

        if vehicle.seguro_vigencia:
            description = f'Renovacion de seguro para {vehicle.marca} {vehicle.modelo} ({vehicle.placas}).'
            _upsert_auto_alert(
                vehicle=vehicle,
                tipo_alerta=VehicleAlert.TipoAlerta.SEGURO,
                tipo_mantenimiento=VehicleAlert.TipoMantenimiento.OTRO,
                descripcion=description,
                fecha_vencimiento=vehicle.seguro_vigencia,
                prioridad=VehicleAlert.Prioridad.MEDIA,
            )
