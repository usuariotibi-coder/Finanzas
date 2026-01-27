from django.conf import settings
from django.db import models

from viaticos.models import Viatico


class Recuperacion(models.Model):
    class Metodo(models.TextChoices):
        TRANSFERENCIA = 'transferencia', 'Transferencia'
        EFECTIVO = 'efectivo', 'Efectivo'
        TARJETA = 'tarjeta', 'Tarjeta'

    viatico = models.ForeignKey(Viatico, on_delete=models.CASCADE, related_name='recuperaciones')
    monto_recuperado = models.DecimalField(max_digits=12, decimal_places=2)
    fecha = models.DateField()
    metodo_pago = models.CharField(max_length=20, choices=Metodo.choices)
    referencia = models.CharField(max_length=120, blank=True)
    registrado_por = models.CharField(max_length=120, blank=True)
    notas = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f'Recuperacion {self.id} - Viatico {self.viatico_id}'
