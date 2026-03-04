from django.db import models


class GSActivity(models.Model):
    class Category(models.TextChoices):
        JOB = 'job', 'Job/Proyecto'
        TRAVEL = 'travel', 'Motivo de Viaje'
        FACILITY = 'facility', 'Facility'
        EMPLOYEE = 'employee', 'Employee'
        OFFICE = 'office', 'Office'
        VEHICLE = 'vehicle', 'Vehicle'

    label = models.CharField(max_length=120)
    account = models.CharField(max_length=20, default='5450')
    code = models.CharField(max_length=20, default='N/A')
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.TRAVEL)
    proyecto_requerido = models.BooleanField(default=True)
    note = models.CharField(max_length=250, blank=True)

    class Meta:
        ordering = ('id',)

    def __str__(self) -> str:
        return f'{self.id} - {self.label}'


class CuentaContable(models.Model):
    codigo = models.CharField(max_length=20, unique=True)
    nombre = models.CharField(max_length=160)
    descripcion = models.TextField(blank=True)
    categoria = models.CharField(max_length=120, default='General')
    proyecto_requerido = models.BooleanField(default=False)
    keywords = models.JSONField(default=list, blank=True)
    activa = models.BooleanField(default=True)

    class Meta:
        ordering = ('codigo',)

    def __str__(self) -> str:
        return f'{self.codigo} - {self.nombre}'


class DepartmentOption(models.Model):
    value = models.CharField(max_length=50, unique=True)
    label = models.CharField(max_length=120)

    class Meta:
        ordering = ('label',)

    def __str__(self) -> str:
        return f'{self.label} ({self.value})'
