from decimal import Decimal

from django.db import migrations, models
from django.db.models.functions import Coalesce

APPROVED_STATUSES = (
    'aprobado',
    'dispersado',
    'en_viaje',
    'viaje_finalizado',
    'en_recuperacion',
    'completado',
)


def recalculate_project_spent(apps, schema_editor):
    Proyecto = apps.get_model('proyectos', 'Proyecto')
    Viatico = apps.get_model('viaticos', 'Viatico')

    decimal_amount = models.DecimalField(max_digits=14, decimal_places=2)
    approved_amount = Coalesce(
        'monto_aprobado',
        'monto_solicitado',
        models.Value(Decimal('0.00')),
        output_field=decimal_amount,
    )

    totals = (
        Viatico.objects.filter(proyecto_id__isnull=False, status__in=APPROVED_STATUSES)
        .values('proyecto_id')
        .annotate(
            total=Coalesce(
                models.Sum(approved_amount),
                models.Value(Decimal('0.00')),
                output_field=decimal_amount,
            )
        )
    )

    Proyecto.objects.all().update(gastado=Decimal('0.00'))
    for row in totals:
        Proyecto.objects.filter(pk=row['proyecto_id']).update(gastado=row['total'])


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ('proyectos', '0001_initial'),
        ('viaticos', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(recalculate_project_spent, noop),
    ]
