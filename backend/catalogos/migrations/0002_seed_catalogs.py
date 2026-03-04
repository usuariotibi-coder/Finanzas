from django.db import migrations


def seed_catalogs(apps, schema_editor):
    GSActivity = apps.get_model('catalogos', 'GSActivity')
    CuentaContable = apps.get_model('catalogos', 'CuentaContable')
    DepartmentOption = apps.get_model('catalogos', 'DepartmentOption')

    gs_defaults = [
        {
            'label': 'Support',
            'account': '5450',
            'code': 'N/A',
            'category': 'travel',
            'proyecto_requerido': True,
            'note': '',
        },
        {
            'label': 'Commissioning',
            'account': '5450',
            'code': 'N/A',
            'category': 'travel',
            'proyecto_requerido': True,
            'note': '',
        },
        {
            'label': 'Instalation',
            'account': '5450',
            'code': 'N/A',
            'category': 'travel',
            'proyecto_requerido': True,
            'note': '',
        },
        {
            'label': 'Assembly Build',
            'account': '5450',
            'code': 'N/A',
            'category': 'travel',
            'proyecto_requerido': True,
            'note': '',
        },
        {
            'label': 'Levantamiento',
            'account': '5450',
            'code': 'N/A',
            'category': 'travel',
            'proyecto_requerido': False,
            'note': '',
        },
        {
            'label': 'Lunch',
            'account': '5450',
            'code': 'N/A',
            'category': 'travel',
            'proyecto_requerido': False,
            'note': '',
        },
        {
            'label': 'Viaticos TE',
            'account': '5450',
            'code': 'N/A',
            'category': 'travel',
            'proyecto_requerido': True,
            'note': '',
        },
        {
            'label': 'Visa',
            'account': '5450',
            'code': 'N/A',
            'category': 'travel',
            'proyecto_requerido': True,
            'note': '',
        },
        {
            'label': 'Otro',
            'account': '5450',
            'code': 'N/A',
            'category': 'travel',
            'proyecto_requerido': True,
            'note': '',
        },
    ]

    if not GSActivity.objects.exists():
        for payload in gs_defaults:
            GSActivity.objects.create(**payload)

    cuentas_defaults = [
        {
            'codigo': '5450',
            'nombre': 'Travel Expenses/Meals',
            'descripcion': 'Gastos de viaje y alimentos relacionados a proyectos especificos',
            'categoria': 'Viaticos',
            'proyecto_requerido': True,
            'keywords': [
                'hotel',
                'hospedaje',
                'lodging',
                'accommodation',
                'vuelo',
                'flight',
                'avion',
                'airline',
                'meal',
                'comida',
                'restaurant',
                'restaurante',
                'uber',
                'taxi',
                'transporte',
                'transportation',
                'rental',
                'renta',
                'gasoline',
                'gasolina',
                'pemex',
                'shell',
                'bp',
            ],
            'activa': True,
        },
        {
            'codigo': '6090',
            'nombre': 'Office Supplies',
            'descripcion': 'Papeleria y suministros de oficina',
            'categoria': 'Administrativo',
            'proyecto_requerido': False,
            'keywords': [
                'office',
                'depot',
                'papeleria',
                'supplies',
                'staples',
                'pens',
                'paper',
                'printer',
                'toner',
                'cartridge',
                'folder',
                'binder',
                'notebook',
                'escritorio',
                'silla',
                'muebles',
            ],
            'activa': True,
        },
        {
            'codigo': '6200',
            'nombre': 'Expense - Non Project',
            'descripcion': 'Gastos no relacionados a proyectos especificos',
            'categoria': 'General',
            'proyecto_requerido': False,
            'keywords': [],
            'activa': True,
        },
    ]

    if not CuentaContable.objects.exists():
        for payload in cuentas_defaults:
            CuentaContable.objects.create(**payload)

    departments_defaults = [
        {'value': 'finanzas', 'label': 'Finanzas'},
        {'value': 'operaciones', 'label': 'Operaciones'},
        {'value': 'business_intelligence', 'label': 'Business Intelligence'},
        {'value': 'diseno_mecanico', 'label': 'Diseno Mecanico'},
        {'value': 'hardware_design', 'label': 'Hardware Design'},
        {'value': 'ensamble', 'label': 'Ensamble'},
        {'value': 'programacion_plc', 'label': 'Programacion PLC'},
        {'value': 'manufactura', 'label': 'Manufactura'},
        {'value': 'otro', 'label': 'Otro'},
    ]

    if not DepartmentOption.objects.exists():
        for payload in departments_defaults:
            DepartmentOption.objects.create(**payload)


def noop(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('catalogos', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_catalogs, noop),
    ]
