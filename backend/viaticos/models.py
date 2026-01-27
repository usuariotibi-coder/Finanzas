from django.conf import settings
from django.db import models

from proyectos.models import Proyecto


class Viatico(models.Model):
    class DestinoPais(models.TextChoices):
        MEXICO = 'Mexico', 'Mexico'
        USA = 'USA', 'USA'
        OTRO = 'Otro', 'Otro'

    class TipoViatico(models.TextChoices):
        EFECTIVO = 'efectifintech', 'Efectivo/Fintech'
        AMEX = 'amex', 'AMEX'
        MIXTO = 'mixto', 'Mixto'

    class Status(models.TextChoices):
        PENDIENTE = 'pendiente', 'Pendiente'
        APROBADO = 'aprobado', 'Aprobado'
        RECHAZADO = 'rechazado', 'Rechazado'
        DISPERSADO = 'dispersado', 'Dispersado'
        EN_VIAJE = 'en_viaje', 'En Viaje'
        VIAJE_FINALIZADO = 'viaje_finalizado', 'Viaje Finalizado'
        EN_RECUPERACION = 'en_recuperacion', 'En Recuperacion'
        COMPLETADO = 'completado', 'Completado'

    class GastoFuente(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        EFECTIFINTECH = 'efectifintech', 'Efectifintech'

    class EfectifintechStatus(models.TextChoices):
        PENDIENTE = 'pendiente', 'Pendiente'
        SINCRONIZADO = 'sincronizado', 'Sincronizado'
        ERROR = 'error', 'Error'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='viaticos')
    proyecto = models.ForeignKey(Proyecto, on_delete=models.SET_NULL, null=True, blank=True)
    gs_activity_id = models.IntegerField(null=True, blank=True)
    motivo = models.CharField(max_length=255)
    origen = models.CharField(max_length=200, blank=True)
    destino = models.CharField(max_length=200)
    destino_pais = models.CharField(max_length=20, choices=DestinoPais.choices, default=DestinoPais.MEXICO)
    tipo_viatico = models.CharField(max_length=20, choices=TipoViatico.choices, default=TipoViatico.EFECTIVO)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    fecha_inicio_real = models.DateField(null=True, blank=True)
    fecha_fin_real = models.DateField(null=True, blank=True)

    monto_solicitado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monto_aprobado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    monto_dispersado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    monto_gastado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    saldo_restante = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDIENTE)
    aprobado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='viaticos_aprobados'
    )
    comentarios = models.TextField(blank=True)

    vehiculo_asignado = models.CharField(max_length=120, blank=True)
    gasto_fuente = models.CharField(max_length=20, choices=GastoFuente.choices, blank=True)
    efectifintech_id = models.CharField(max_length=120, blank=True)
    efectifintech_status = models.CharField(max_length=20, choices=EfectifintechStatus.choices, blank=True)
    efectifintech_last_sync_at = models.DateTimeField(null=True, blank=True)
    dias_sin_recuperar = models.IntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'Viatico {self.id} - {self.user}'


class ViaticoDocumento(models.Model):
    class Tipo(models.TextChoices):
        PDF = 'pdf', 'PDF'
        XML = 'xml', 'XML'
        TICKET = 'ticket', 'Ticket'

    viatico = models.ForeignKey(Viatico, on_delete=models.CASCADE, related_name='documentos')
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    descripcion = models.CharField(max_length=255, blank=True)
    archivo = models.FileField(upload_to='viaticos/documentos/')
    monto = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    fecha = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
