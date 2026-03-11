from django.conf import settings
from django.db import models

from proyectos.models import Proyecto
from conciliacion.models import Factura


class TarjetaAMEX(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    card_number = models.CharField(max_length=32)
    card_holder = models.CharField(max_length=120, blank=True)
    external_personnel = models.BooleanField(default=False)
    external_email = models.EmailField(blank=True)
    employee_number = models.CharField(max_length=50, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    expiration_date = models.DateField(null=True, blank=True)
    comodin = models.BooleanField(default=False)
    department = models.CharField(max_length=120, blank=True)
    activa = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f'{self.card_holder} ({self.card_number})'


class TicketAMEX(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    card_number = models.CharField(max_length=10)
    card_holder = models.CharField(max_length=120)
    fecha = models.DateField()
    comercio = models.CharField(max_length=200)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    monto_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tipo_cambio = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    categoria = models.CharField(max_length=120)
    cuenta_contable = models.CharField(max_length=20)
    proyecto = models.ForeignKey(Proyecto, on_delete=models.SET_NULL, null=True, blank=True)
    gs_activity_id = models.IntegerField(null=True, blank=True)
    pais_comercio = models.CharField(max_length=120)
    factura = models.ForeignKey(Factura, on_delete=models.SET_NULL, null=True, blank=True)
    factura_pdf_name = models.CharField(max_length=200, blank=True)
    factura_xml_name = models.CharField(max_length=200, blank=True)
    factura_notas = models.TextField(blank=True)
    matched = models.BooleanField(default=False)
    autorizado = models.BooleanField(default=False)
    duplicado = models.BooleanField(default=False)
    clasificacion_auto = models.BooleanField(default=False)
    observaciones = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f'Ticket AMEX {self.id} - {self.comercio}'
