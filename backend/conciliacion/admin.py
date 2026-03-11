from django.contrib import admin

from .models import AlertaConciliacion, Conciliacion, Consumo, Factura


@admin.register(Factura)
class FacturaAdmin(admin.ModelAdmin):
    list_display = ('uuid', 'user', 'total', 'status', 'fecha')
    list_filter = ('status',)
    search_fields = ('uuid', 'folio', 'rfc', 'razon_social')


@admin.register(Consumo)
class ConsumoAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'card_number', 'employee_number', 'comercio', 'monto', 'fecha', 'matched')
    list_filter = ('matched', 'autorizado')


@admin.register(Conciliacion)
class ConciliacionAdmin(admin.ModelAdmin):
    list_display = ('id', 'mes', 'anio', 'periodo', 'status')
    list_filter = ('status',)


@admin.register(AlertaConciliacion)
class AlertaConciliacionAdmin(admin.ModelAdmin):
    list_display = ('id', 'tipo', 'gravedad', 'conciliacion')
    list_filter = ('tipo', 'gravedad')
