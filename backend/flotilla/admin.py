from django.contrib import admin

from .models import (
    CargaGasolina,
    MaintenanceRecord,
    Vehicle,
    VehicleAlert,
    VehicleAssignment,
    VehicleExpense,
)


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ('marca', 'modelo', 'anio', 'placas', 'status', 'km_actual')
    search_fields = ('marca', 'modelo', 'placas', 'numero_serie')
    list_filter = ('status',)


@admin.register(VehicleAssignment)
class VehicleAssignmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'vehicle', 'user', 'fecha_inicio', 'status')
    list_filter = ('status', 'proposito')
    search_fields = ('vehicle__placas', 'user__full_name', 'motivo')


@admin.register(VehicleAlert)
class VehicleAlertAdmin(admin.ModelAdmin):
    list_display = ('id', 'vehicle', 'tipo_mantenimiento', 'tipo_alerta', 'prioridad', 'atendido')
    list_filter = ('tipo_mantenimiento', 'tipo_alerta', 'prioridad', 'atendido')


@admin.register(VehicleExpense)
class VehicleExpenseAdmin(admin.ModelAdmin):
    list_display = ('id', 'vehicle', 'tipo', 'monto', 'fecha')
    list_filter = ('tipo',)


@admin.register(CargaGasolina)
class CargaGasolinaAdmin(admin.ModelAdmin):
    list_display = ('id', 'vehicle', 'fecha', 'litros', 'total')
    list_filter = ('fecha',)


@admin.register(MaintenanceRecord)
class MaintenanceRecordAdmin(admin.ModelAdmin):
    list_display = ('id', 'vehicle', 'fecha', 'tipo', 'costo')
    list_filter = ('tipo',)
