from django.conf import settings
from django.db import models

from viaticos.models import Viatico


class Factura(models.Model):
    class Status(models.TextChoices):
        PENDIENTE = 'pendiente', 'Pendiente'
        VALIDADA = 'validada', 'Validada'
        RECHAZADA = 'rechazada', 'Rechazada'
        CONCILIADA = 'conciliada', 'Conciliada'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='facturas')
    viatico = models.ForeignKey(Viatico, on_delete=models.SET_NULL, null=True, blank=True)
    folio = models.CharField(max_length=120)
    uuid = models.CharField(max_length=120)
    rfc = models.CharField(max_length=20)
    razon_social = models.CharField(max_length=200)
    fecha = models.DateField()
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    iva = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    forma_pago = models.CharField(max_length=120)
    metodo_pago = models.CharField(max_length=120)
    conceptos = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDIENTE)
    archivo_xml = models.FileField(upload_to='conciliacion/xml/', null=True, blank=True)
    archivo_pdf = models.FileField(upload_to='conciliacion/pdf/', null=True, blank=True)
    validacion_cfdi = models.JSONField(default=dict, blank=True)
    match_consumo = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f'Factura {self.uuid}'


class Consumo(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='consumos')
    viatico = models.ForeignKey(Viatico, on_delete=models.SET_NULL, null=True, blank=True)
    factura = models.ForeignKey(Factura, on_delete=models.SET_NULL, null=True, blank=True)
    card_number = models.CharField(max_length=32, blank=True)
    employee_number = models.CharField(max_length=50, blank=True)
    fecha = models.DateField()
    comercio = models.CharField(max_length=200)
    pais_comercio = models.CharField(max_length=120, blank=True)
    tipo_movimiento = models.CharField(max_length=120, blank=True)
    concepto = models.CharField(max_length=120, blank=True)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    propina_detectada = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    propina_porcentaje = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    categoria = models.CharField(max_length=120)
    factura_pdf_name = models.CharField(max_length=200, blank=True)
    factura_xml_name = models.CharField(max_length=200, blank=True)
    factura_notas = models.TextField(blank=True)
    matched = models.BooleanField(default=False)
    autorizado = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)


class Conciliacion(models.Model):
    class Periodo(models.TextChoices):
        PRIMERA_QUINCENA = '1-15', '1-15'
        SEGUNDA_QUINCENA = '16-30', '16-30'

    class Status(models.TextChoices):
        EN_PROCESO = 'en_proceso', 'En Proceso'
        COMPLETADA = 'completada', 'Completada'
        REVISADA = 'revisada', 'Revisada'

    periodo = models.CharField(max_length=10, choices=Periodo.choices)
    mes = models.IntegerField()
    anio = models.IntegerField()
    facturas = models.IntegerField(default=0)
    consumos = models.IntegerField(default=0)
    matched = models.IntegerField(default=0)
    discrepancias = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.EN_PROCESO)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f'Conciliacion {self.mes}/{self.anio} {self.periodo}'


class AlertaConciliacion(models.Model):
    class Tipo(models.TextChoices):
        CONSUMO_SIN_FACTURA = 'consumo_sin_factura', 'Consumo sin factura'
        FACTURA_SIN_CONSUMO = 'factura_sin_consumo', 'Factura sin consumo'
        MONTO_DIFERENTE = 'monto_diferente', 'Monto diferente'
        ARTICULO_PERSONAL = 'articulo_personal', 'Articulo personal'
        PROPINA_EXCEDIDA = 'propina_excedida', 'Propina excedida'
        DUPLICADO = 'duplicado', 'Duplicado'

    class Gravedad(models.TextChoices):
        ALTA = 'alta', 'Alta'
        MEDIA = 'media', 'Media'
        BAJA = 'baja', 'Baja'

    conciliacion = models.ForeignKey(Conciliacion, on_delete=models.CASCADE, related_name='alertas')
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    descripcion = models.CharField(max_length=255)
    gravedad = models.CharField(max_length=10, choices=Gravedad.choices)
    factura = models.ForeignKey(Factura, on_delete=models.SET_NULL, null=True, blank=True)
    consumo = models.ForeignKey(Consumo, on_delete=models.SET_NULL, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f'Alerta {self.tipo} - {self.gravedad}'
