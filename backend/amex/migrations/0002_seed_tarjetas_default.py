from django.db import migrations


def seed_tarjetas(apps, schema_editor):
    TarjetaAMEX = apps.get_model('amex', 'TarjetaAMEX')
    if TarjetaAMEX.objects.exists():
        return

    defaults = [
        {'card_number': '1001', 'card_holder': 'Francisco Aguilar', 'department': 'Direccion', 'activa': True},
        {'card_number': '1002', 'card_holder': 'Luis Kuara', 'department': 'Guest Services', 'activa': True},
        {'card_number': '1003', 'card_holder': 'Maria Gonzalez', 'department': 'Finanzas', 'activa': True},
        {'card_number': '1004', 'card_holder': 'Carlos Mendoza', 'department': 'Operaciones', 'activa': True},
        {'card_number': '1005', 'card_holder': 'Ana Martinez', 'department': 'Comercial', 'activa': True},
        {'card_number': '1006', 'card_holder': 'Roberto Sanchez', 'department': 'Tecnologia', 'activa': True},
        {'card_number': '1007', 'card_holder': 'Laura Jimenez', 'department': 'RH', 'activa': True},
        {'card_number': '1008', 'card_holder': 'Pedro Ramirez', 'department': 'Logistica', 'activa': True},
    ]

    for payload in defaults:
        TarjetaAMEX.objects.create(**payload)


def noop(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('amex', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_tarjetas, noop),
    ]
