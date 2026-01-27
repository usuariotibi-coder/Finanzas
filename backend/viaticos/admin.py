from django.contrib import admin

from .models import Viatico, ViaticoDocumento


@admin.register(Viatico)
class ViaticoAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'proyecto', 'status', 'fecha_inicio', 'fecha_fin')
    search_fields = ('id', 'user__full_name', 'motivo', 'destino')
    list_filter = ('status', 'tipo_viatico', 'destino_pais')


@admin.register(ViaticoDocumento)
class ViaticoDocumentoAdmin(admin.ModelAdmin):
    list_display = ('id', 'viatico', 'tipo', 'monto', 'fecha')
    list_filter = ('tipo',)
