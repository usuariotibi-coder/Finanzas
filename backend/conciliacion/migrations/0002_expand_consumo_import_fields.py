from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('conciliacion', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='consumo',
            name='card_number',
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name='consumo',
            name='concepto',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='consumo',
            name='employee_number',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='consumo',
            name='pais_comercio',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='consumo',
            name='tipo_movimiento',
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
