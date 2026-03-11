from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('amex', '0002_seed_tarjetas_default'),
    ]

    operations = [
        migrations.AddField(
            model_name='tarjetaamex',
            name='account_number',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='tarjetaamex',
            name='comodin',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='tarjetaamex',
            name='employee_number',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='tarjetaamex',
            name='expiration_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='tarjetaamex',
            name='user',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='tarjetaamex',
            name='card_holder',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AlterField(
            model_name='tarjetaamex',
            name='card_number',
            field=models.CharField(max_length=32),
        ),
    ]
