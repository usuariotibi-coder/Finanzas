from django.contrib import admin

from .models import TarjetaAMEX, TicketAMEX


@admin.register(TicketAMEX)
class TicketAMEXAdmin(admin.ModelAdmin):
    list_display = ('id', 'card_holder', 'card_number', 'comercio', 'monto', 'matched')
    list_filter = ('matched', 'autorizado', 'duplicado')


@admin.register(TarjetaAMEX)
class TarjetaAMEXAdmin(admin.ModelAdmin):
    list_display = (
        'card_holder',
        'card_number',
        'external_personnel',
        'external_email',
        'employee_number',
        'account_number',
        'expiration_date',
        'comodin',
        'department',
        'activa',
    )
    list_filter = ('external_personnel', 'comodin', 'activa')
