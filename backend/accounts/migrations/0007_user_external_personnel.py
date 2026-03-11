from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_user_category'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='external_personnel',
            field=models.BooleanField(default=False),
        ),
    ]
