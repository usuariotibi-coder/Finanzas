from django.conf import settings
from django.db import models

from proyectos.models import Proyecto


class SolicitudViaje(models.Model):
    class Status(models.TextChoices):
        PENDIENTE = 'pendiente', 'Pendiente'
        EN_PROCESO = 'en_proceso', 'En Proceso'
        CONFIRMADO = 'confirmado', 'Confirmado'
        CANCELADO = 'cancelado', 'Cancelado'
        COMPLETADO = 'completado', 'Completado'
        RECHAZADO = 'rechazado', 'Rechazado'

    class StatusServicio(models.TextChoices):
        PENDIENTE = 'pendiente', 'Pendiente'
        GESTIONANDO = 'gestionando', 'Gestionando'
        CONFIRMADO = 'confirmado', 'Confirmado'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='solicitudes_viaje')
    proyecto = models.ForeignKey(Proyecto, on_delete=models.SET_NULL, null=True, blank=True)
    origen = models.CharField(max_length=200, blank=True)
    destino = models.CharField(max_length=200)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    motivo = models.CharField(max_length=255)
    necesita_avion = models.BooleanField(default=False)
    necesita_camion = models.BooleanField(default=False)
    necesita_hotel = models.BooleanField(default=False)
    detalles_avion = models.TextField(blank=True)
    detalles_camion = models.TextField(blank=True)
    detalles_hotel = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDIENTE)
    status_avion = models.CharField(max_length=20, choices=StatusServicio.choices, blank=True)
    status_camion = models.CharField(max_length=20, choices=StatusServicio.choices, blank=True)
    status_hotel = models.CharField(max_length=20, choices=StatusServicio.choices, blank=True)
    notas = models.TextField(blank=True)
    costo_estimado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    costo_final = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    confirmaciones_avion = models.JSONField(default=list, blank=True)
    confirmaciones_camion = models.JSONField(default=list, blank=True)
    confirmaciones_hotel = models.JSONField(default=list, blank=True)
    atendido_por = models.CharField(max_length=120, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'SolicitudViaje {self.id} - {self.user}'
