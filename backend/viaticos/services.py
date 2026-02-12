from decimal import Decimal

from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce


def recalculate_project_spent(proyecto_id: int | None):
    if not proyecto_id:
        return

    from proyectos.models import Proyecto
    from .models import Viatico

    total_spent = (
        Viatico.objects.filter(proyecto_id=proyecto_id)
        .aggregate(
            total=Coalesce(
                Sum('monto_gastado'),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        )
        .get('total', Decimal('0.00'))
    )

    Proyecto.objects.filter(pk=proyecto_id).update(gastado=total_spent)
