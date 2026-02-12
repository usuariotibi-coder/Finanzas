from django.apps import AppConfig


class ViaticosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'viaticos'

    def ready(self):
        # Register model signal handlers for project spend synchronization.
        from . import signals  # noqa: F401
