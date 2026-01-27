from django.db import models


class Proyecto(models.Model):
    class Estado(models.TextChoices):
        ACTIVO = 'activo', 'Activo'
        EN_PAUSA = 'en_pausa', 'En Pausa'
        COMPLETADO = 'completado', 'Completado'
        CANCELADO = 'cancelado', 'Cancelado'

    codigo = models.CharField(max_length=50, unique=True)
    nombre = models.CharField(max_length=200)
    cliente = models.CharField(max_length=200)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.ACTIVO)
    presupuesto = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    gastado = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    fecha_inicio = models.DateField()
    fecha_fin_estimada = models.DateField(null=True, blank=True)
    fecha_fin_real = models.DateField(null=True, blank=True)
    responsable = models.CharField(max_length=120)
    departamento = models.CharField(max_length=120, blank=True)
    descripcion = models.TextField(blank=True)
    notas = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'{self.codigo} - {self.nombre}'
