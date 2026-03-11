from django.db import migrations, models


def seed_viatico_meal_config(apps, schema_editor):
    ViaticoMealConfig = apps.get_model('catalogos', 'ViaticoMealConfig')
    ViaticoMealConfig.objects.get_or_create(
        pk=1,
        defaults={
            'desayuno': 150,
            'comida': 200,
            'cena': 250,
        },
    )


def noop(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('catalogos', '0003_usercategoryoption'),
    ]

    operations = [
        migrations.CreateModel(
            name='ViaticoMealConfig',
            fields=[
                ('id', models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ('desayuno', models.DecimalField(decimal_places=2, default=150, max_digits=10)),
                ('comida', models.DecimalField(decimal_places=2, default=200, max_digits=10)),
                ('cena', models.DecimalField(decimal_places=2, default=250, max_digits=10)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Configuracion de tarifas de viatico',
                'verbose_name_plural': 'Configuracion de tarifas de viatico',
            },
        ),
        migrations.RunPython(seed_viatico_meal_config, noop),
    ]
