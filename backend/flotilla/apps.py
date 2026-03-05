from django.apps import AppConfig


class FlotillaConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'flotilla'

    def ready(self):
        from . import signals  # noqa: F401
