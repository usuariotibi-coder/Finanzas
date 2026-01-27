from django.contrib import admin

from .models import Recuperacion


@admin.register(Recuperacion)
class RecuperacionAdmin(admin.ModelAdmin):
    list_display = ('id', 'viatico', 'monto_recuperado', 'fecha', 'metodo_pago')
    list_filter = ('metodo_pago',)
    search_fields = ('viatico__id', 'referencia')
