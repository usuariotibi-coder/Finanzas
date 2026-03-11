from django.db import migrations, models


def seed_user_categories(apps, schema_editor):
    UserCategoryOption = apps.get_model('catalogos', 'UserCategoryOption')
    defaults = [
        {'value': 'gerente', 'label': 'Gerente'},
        {'value': 'operador', 'label': 'Operador'},
    ]
    if not UserCategoryOption.objects.exists():
        for payload in defaults:
            UserCategoryOption.objects.create(**payload)


def noop(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('catalogos', '0002_seed_catalogs'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserCategoryOption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('value', models.CharField(max_length=50, unique=True)),
                ('label', models.CharField(max_length=120)),
            ],
            options={
                'ordering': ('label',),
            },
        ),
        migrations.RunPython(seed_user_categories, noop),
    ]
