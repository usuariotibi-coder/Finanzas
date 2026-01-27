from django.conf import settings
from django.db import models

from viaticos.models import Viatico


class Dispersion(models.Model):
    class Metodo(models.TextChoices):
        TRANSFERENCIA = 'transferencia', 'Transferencia'
        EFECTIVO = 'efectivo', 'Efectivo'
        TARJETA = 'tarjeta', 'Tarjeta'

    class Moneda(models.TextChoices):
        MXN = 'MXN', 'MXN'
        USD = 'USD', 'USD'

    viatico = models.ForeignKey(Viatico, on_delete=models.CASCADE, related_name='dispersiones')
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    monto_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tipo_cambio = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    moneda = models.CharField(max_length=3, choices=Moneda.choices, default=Moneda.MXN)
    fecha = models.DateField()
    metodo_pago = models.CharField(max_length=20, choices=Metodo.choices)
    referencia = models.CharField(max_length=100, blank=True)
    confirmado = models.BooleanField(default=False)
    dispersado_por = models.CharField(max_length=120, blank=True)
    notas = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
