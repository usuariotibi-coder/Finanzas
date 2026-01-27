from django.contrib import admin

from .models import Dispersion


@admin.register(Dispersion)
class DispersionAdmin(admin.ModelAdmin):
    list_display = ('id', 'viatico', 'monto', 'metodo_pago', 'fecha', 'confirmado')
    list_filter = ('metodo_pago', 'confirmado', 'moneda')
    search_fields = ('viatico__id', 'referencia')
