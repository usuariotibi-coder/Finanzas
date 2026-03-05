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

    Proyecto.objects.filter(pk=proyecto_id).update(gastado=viaticos_spent + flotilla_spent)


def recalculate_all_project_spent(proyecto_ids: Iterable[int] | None = None):
    from proyectos.models import Proyecto

    normalized_ids = [int(proyecto_id) for proyecto_id in (proyecto_ids or []) if proyecto_id]
    if normalized_ids:
        target_ids = normalized_ids
    else:
        target_ids = list(Proyecto.objects.values_list('id', flat=True))

    for proyecto_id in target_ids:
        recalculate_project_spent(proyecto_id)
