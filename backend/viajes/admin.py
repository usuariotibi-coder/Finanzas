from django.contrib import admin

from .models import SolicitudViaje


@admin.register(SolicitudViaje)
class SolicitudViajeAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'destino', 'fecha_inicio', 'fecha_fin', 'status')
    list_filter = ('status', 'necesita_avion', 'necesita_camion', 'necesita_hotel')
    search_fields = ('user__full_name', 'destino', 'motivo')
