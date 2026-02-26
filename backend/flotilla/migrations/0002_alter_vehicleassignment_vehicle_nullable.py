from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('flotilla', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='vehicleassignment',
            name='vehicle',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name='asignaciones',
                to='flotilla.vehicle',
            ),
        ),
    ]
