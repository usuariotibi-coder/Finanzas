from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('conciliacion', '0002_expand_consumo_import_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='consumo',
            name='propina_detectada',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='consumo',
            name='propina_porcentaje',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True),
        ),
    ]
