from django.contrib import admin

from .models import TarjetaAMEX, TicketAMEX


@admin.register(TicketAMEX)
class TicketAMEXAdmin(admin.ModelAdmin):
    list_display = ('id', 'card_holder', 'card_number', 'comercio', 'monto', 'matched')
    list_filter = ('matched', 'autorizado', 'duplicado')


@admin.register(TarjetaAMEX)
class TarjetaAMEXAdmin(admin.ModelAdmin):
    list_display = ('card_holder', 'card_number', 'department', 'activa')
    list_filter = ('activa',)
