from collections.abc import Iterable
from decimal import Decimal

from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce

APPROVED_STATUSES = (
    'aprobado',
    'dispersado',
    'en_viaje',
    'viaje_finalizado',
    'en_recuperacion',
    'completado',
)

TRIP_EXCLUDED_STATUSES = (
    'rechazado',
    'cancelado',
)


def _sum_trip_airfare(proyecto_id: int) -> Decimal:
    from viajes.models import SolicitudViaje

    total = Decimal('0.00')
    solicitudes = SolicitudViaje.objects.filter(
        proyecto_id=proyecto_id,
        necesita_avion=True,
    ).exclude(status__in=TRIP_EXCLUDED_STATUSES)

    for solicitud in solicitudes:
        flight_total = Decimal('0.00')
        for confirmacion in solicitud.confirmaciones_avion or []:
            if not isinstance(confirmacion, dict):
                continue
            costo = confirmacion.get('costo')
            if costo in (None, ''):
                continue
            try:
                parsed_cost = Decimal(str(costo))
            except (ArithmeticError, TypeError, ValueError):
                continue
            if parsed_cost > 0:
                flight_total += parsed_cost

        if flight_total == Decimal('0.00'):
            has_only_flight_service = not solicitud.necesita_camion and not solicitud.necesita_hotel
            if has_only_flight_service and solicitud.costo_final:
                flight_total = Decimal(str(solicitud.costo_final))

        total += flight_total

    return total


def recalculate_project_spent(proyecto_id: int | None):
    if not proyecto_id:
        return

    from proyectos.models import Proyecto
    from flotilla.models import VehicleExpense
    from .models import Viatico

    decimal_amount = DecimalField(max_digits=14, decimal_places=2)

    viaticos_spent = (
        Viatico.objects.filter(proyecto_id=proyecto_id, status__in=APPROVED_STATUSES)
        .aggregate(
            total=Coalesce(
                Sum(
                    Coalesce(
                        'monto_aprobado',
                        'monto_solicitado',
                        Value(Decimal('0.00')),
                        output_field=decimal_amount,
                    )
                ),
                Value(Decimal('0.00')),
                output_field=decimal_amount,
            )
        )
        .get('total', Decimal('0.00'))
    )

    flotilla_spent = (
        VehicleExpense.objects.filter(assignment__proyecto_id=proyecto_id)
        .aggregate(
            total=Coalesce(
                Sum('monto'),
                Value(Decimal('0.00')),
                output_field=decimal_amount,
            )
        )
        .get('total', Decimal('0.00'))
    )

    viajes_spent = _sum_trip_airfare(proyecto_id)

    Proyecto.objects.filter(pk=proyecto_id).update(gastado=viaticos_spent + flotilla_spent + viajes_spent)


def recalculate_all_project_spent(proyecto_ids: Iterable[int] | None = None):
    from proyectos.models import Proyecto

    normalized_ids = [int(proyecto_id) for proyecto_id in (proyecto_ids or []) if proyecto_id]
    if normalized_ids:
        target_ids = normalized_ids
    else:
        target_ids = list(Proyecto.objects.values_list('id', flat=True))

    for proyecto_id in target_ids:
        recalculate_project_spent(proyecto_id)
