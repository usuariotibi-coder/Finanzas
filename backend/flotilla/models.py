from django.conf import settings
from django.db import models

from proyectos.models import Proyecto
from viaticos.models import Viatico


class Vehicle(models.Model):
    class Status(models.TextChoices):
        DISPONIBLE = 'disponible', 'Disponible'
        ASIGNADO = 'asignado', 'Asignado'
        EN_TALLER = 'en_taller', 'En Taller'
        BAJA = 'baja', 'Baja'

    marca = models.CharField(max_length=120)
    modelo = models.CharField(max_length=120)
    anio = models.IntegerField()
    placas = models.CharField(max_length=20, unique=True)
    numero_serie = models.CharField(max_length=80, unique=True)
    color = models.CharField(max_length=80)

    seguro_compania = models.CharField(max_length=120, blank=True)
    seguro_poliza = models.CharField(max_length=120, blank=True)
    seguro_vigencia = models.DateField(null=True, blank=True)

    mantenimiento_ultimo_servicio = models.DateField(null=True, blank=True)
    mantenimiento_km_ultimo = models.IntegerField(null=True, blank=True)
    mantenimiento_proximo_servicio = models.DateField(null=True, blank=True)
    mantenimiento_km_proximo = models.IntegerField(null=True, blank=True)

    km_actual = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DISPONIBLE)
    foto = models.FileField(upload_to='flotilla/vehiculos/', null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'{self.marca} {self.modelo} ({self.placas})'


class VehicleAssignment(models.Model):
    class Status(models.TextChoices):
        SOLICITADO = 'solicitado', 'Solicitado'
        ASIGNADO = 'asignado', 'Asignado'
        ACTIVO = 'activo', 'Activo'
        COMPLETADO = 'completado', 'Completado'
        RECHAZADO = 'rechazado', 'Rechazado'

    class Proposito(models.TextChoices):
        OPERACIONES = 'operaciones', 'Operaciones'
        VISITA = 'visita', 'Visita'
        VIAJE = 'viaje', 'Viaje'

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='asignaciones')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vehicle_assignments')
    viatico = models.ForeignKey(Viatico, on_delete=models.SET_NULL, null=True, blank=True)
    proyecto = models.ForeignKey(Proyecto, on_delete=models.SET_NULL, null=True, blank=True)
    origen = models.CharField(max_length=200, blank=True)
    destino = models.CharField(max_length=200, blank=True)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField(null=True, blank=True)
    motivo = models.CharField(max_length=255)
    proposito = models.CharField(max_length=20, choices=Proposito.choices)
    km_inicial = models.IntegerField(default=0)
    km_final = models.IntegerField(null=True, blank=True)
    foto_odometro_inicial = models.FileField(upload_to='flotilla/odometro/', null=True, blank=True)
    foto_odometro_final = models.FileField(upload_to='flotilla/odometro/', null=True, blank=True)
    checklist_recepcion = models.JSONField(default=dict, blank=True)
    checklist_entrega = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SOLICITADO)
    incidentes = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'Asignacion {self.id} - {self.vehicle}'


class VehicleAlert(models.Model):
    class TipoMantenimiento(models.TextChoices):
        PREVENTIVO = 'preventivo', 'Preventivo'
        PREDICTIVO = 'predictivo', 'Predictivo'
        CORRECTIVO = 'correctivo', 'Correctivo'
        OTRO = 'otro', 'Otro'

    class TipoAlerta(models.TextChoices):
        SERVICIO = 'servicio', 'Servicio'
        SEGURO = 'seguro', 'Seguro'
        VERIFICACION = 'verificacion', 'Verificacion'
        PLACAS = 'placas', 'Placas'
        REPARACION = 'reparacion', 'Reparacion'

    class Prioridad(models.TextChoices):
        ALTA = 'alta', 'Alta'
        MEDIA = 'media', 'Media'
        BAJA = 'baja', 'Baja'

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='alertas')
    tipo_mantenimiento = models.CharField(max_length=20, choices=TipoMantenimiento.choices)
    tipo_alerta = models.CharField(max_length=20, choices=TipoAlerta.choices)
    descripcion = models.CharField(max_length=255)
    fecha_vencimiento = models.DateField()
    prioridad = models.CharField(max_length=10, choices=Prioridad.choices)
    costo_estimado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    proveedor_sugerido = models.CharField(max_length=120, blank=True)
    atendido = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f'Alerta {self.id} - {self.vehicle}'


class VehicleExpense(models.Model):
    class Tipo(models.TextChoices):
        GASOLINA = 'gasolina', 'Gasolina'
        MANTENIMIENTO = 'mantenimiento', 'Mantenimiento'
        SEGURO = 'seguro', 'Seguro'
        VERIFICACION = 'verificacion', 'Verificacion'
        OTRO = 'otro', 'Otro'

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='gastos')
    assignment = models.ForeignKey(VehicleAssignment, on_delete=models.SET_NULL, null=True, blank=True)
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    fecha = models.DateField()
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    descripcion = models.CharField(max_length=255)
    factura_id = models.CharField(max_length=120, blank=True)
    odometro = models.IntegerField(null=True, blank=True)
    proveedor = models.CharField(max_length=120, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)


class CargaGasolina(models.Model):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='cargas_gasolina')
    assignment = models.ForeignKey(VehicleAssignment, on_delete=models.SET_NULL, null=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    fecha = models.DateField()
    litros = models.DecimalField(max_digits=10, decimal_places=2)
    precio_litro = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    odometro = models.IntegerField()
    estacion = models.CharField(max_length=120)
    factura_id = models.CharField(max_length=120, blank=True)
    eficiencia = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)


class MaintenanceRecord(models.Model):
    class Tipo(models.TextChoices):
        PREVENTIVO = 'preventivo', 'Preventivo'
        PREDICTIVO = 'predictivo', 'Predictivo'
        CORRECTIVO = 'correctivo', 'Correctivo'
        OTRO = 'otro', 'Otro'

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='historial_mantenimiento')
    fecha = models.DateField()
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    descripcion = models.CharField(max_length=255)
    costo = models.DecimalField(max_digits=12, decimal_places=2)
    km = models.IntegerField(null=True, blank=True)
    proveedor = models.CharField(max_length=120, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
