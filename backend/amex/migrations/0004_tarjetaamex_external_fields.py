from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('amex', '0003_expand_tarjetaamex_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='tarjetaamex',
            name='external_email',
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name='tarjetaamex',
            name='external_personnel',
            field=models.BooleanField(default=False),
        ),
    ]
