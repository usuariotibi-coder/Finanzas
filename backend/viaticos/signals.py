from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import Viatico
from .services import recalculate_project_spent


@receiver(pre_save, sender=Viatico)
def cache_previous_project(sender, instance: Viatico, **kwargs):
    if not instance.pk:
        instance._previous_proyecto_id = None  # type: ignore[attr-defined]
        return

    previous_project_id = (
        sender.objects.filter(pk=instance.pk).values_list('proyecto_id', flat=True).first()
    )
    instance._previous_proyecto_id = previous_project_id  # type: ignore[attr-defined]


@receiver(post_save, sender=Viatico)
def sync_project_spent_on_save(sender, instance: Viatico, **kwargs):
    previous_project_id = getattr(instance, '_previous_proyecto_id', None)
    current_project_id = instance.proyecto_id

    if previous_project_id and previous_project_id != current_project_id:
        recalculate_project_spent(previous_project_id)

    recalculate_project_spent(current_project_id)


@receiver(post_delete, sender=Viatico)
def sync_project_spent_on_delete(sender, instance: Viatico, **kwargs):
    recalculate_project_spent(instance.proyecto_id)
