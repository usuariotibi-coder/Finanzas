from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from viaticos.services import recalculate_project_spent

from .models import VehicleAssignment, VehicleExpense


def _get_assignment_project_id(*, assignment_id: int | None = None, assignment: VehicleAssignment | None = None) -> int | None:
    if assignment is not None and assignment.proyecto_id:
        return assignment.proyecto_id
    if not assignment_id:
        return None
    return VehicleAssignment.objects.filter(pk=assignment_id).values_list('proyecto_id', flat=True).first()


@receiver(pre_save, sender=VehicleAssignment)
def cache_previous_assignment_project(sender, instance: VehicleAssignment, **kwargs):
    if not instance.pk:
        instance._previous_proyecto_id = None  # type: ignore[attr-defined]
        return

    previous_project_id = sender.objects.filter(pk=instance.pk).values_list('proyecto_id', flat=True).first()
    instance._previous_proyecto_id = previous_project_id  # type: ignore[attr-defined]


@receiver(post_save, sender=VehicleAssignment)
def sync_project_spent_on_assignment_save(sender, instance: VehicleAssignment, **kwargs):
    previous_project_id = getattr(instance, '_previous_proyecto_id', None)
    current_project_id = instance.proyecto_id

    if previous_project_id and previous_project_id != current_project_id:
        recalculate_project_spent(previous_project_id)

    recalculate_project_spent(current_project_id)


@receiver(post_delete, sender=VehicleAssignment)
def sync_project_spent_on_assignment_delete(sender, instance: VehicleAssignment, **kwargs):
    recalculate_project_spent(instance.proyecto_id)


@receiver(pre_save, sender=VehicleExpense)
def cache_previous_expense_project(sender, instance: VehicleExpense, **kwargs):
    if not instance.pk:
        instance._previous_proyecto_id = None  # type: ignore[attr-defined]
        return

    previous_project_id = (
        sender.objects.filter(pk=instance.pk).values_list('assignment__proyecto_id', flat=True).first()
    )
    instance._previous_proyecto_id = previous_project_id  # type: ignore[attr-defined]


@receiver(post_save, sender=VehicleExpense)
def sync_project_spent_on_expense_save(sender, instance: VehicleExpense, **kwargs):
    previous_project_id = getattr(instance, '_previous_proyecto_id', None)
    current_project_id = _get_assignment_project_id(
        assignment_id=instance.assignment_id,
        assignment=getattr(instance, 'assignment', None),
    )

    if previous_project_id and previous_project_id != current_project_id:
        recalculate_project_spent(previous_project_id)

    recalculate_project_spent(current_project_id)


@receiver(post_delete, sender=VehicleExpense)
def sync_project_spent_on_expense_delete(sender, instance: VehicleExpense, **kwargs):
    recalculate_project_spent(
        _get_assignment_project_id(
            assignment_id=instance.assignment_id,
            assignment=getattr(instance, 'assignment', None),
        )
    )
