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
    from .models import Viatico

    decimal_amount = DecimalField(max_digits=14, decimal_places=2)

    total_spent = (
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

    Proyecto.objects.filter(pk=proyecto_id).update(gastado=total_spent)
