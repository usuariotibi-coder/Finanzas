from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from viaticos.services import recalculate_project_spent

from .models import SolicitudViaje


@receiver(pre_save, sender=SolicitudViaje)
def cache_previous_trip_project(sender, instance: SolicitudViaje, **kwargs):
    if not instance.pk:
        instance._previous_proyecto_id = None  # type: ignore[attr-defined]
        return

    previous_project_id = sender.objects.filter(pk=instance.pk).values_list('proyecto_id', flat=True).first()
    instance._previous_proyecto_id = previous_project_id  # type: ignore[attr-defined]


@receiver(post_save, sender=SolicitudViaje)
def sync_project_spent_on_trip_save(sender, instance: SolicitudViaje, **kwargs):
    previous_project_id = getattr(instance, '_previous_proyecto_id', None)
    current_project_id = instance.proyecto_id

    if previous_project_id and previous_project_id != current_project_id:
        recalculate_project_spent(previous_project_id)

    recalculate_project_spent(current_project_id)


@receiver(post_delete, sender=SolicitudViaje)
def sync_project_spent_on_trip_delete(sender, instance: SolicitudViaje, **kwargs):
    recalculate_project_spent(instance.proyecto_id)
