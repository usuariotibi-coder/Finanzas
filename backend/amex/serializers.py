from rest_framework import serializers

from .models import TarjetaAMEX, TicketAMEX


class TarjetaAMEXSerializer(serializers.ModelSerializer):
    class Meta:
        model = TarjetaAMEX
        fields = '__all__'


class TicketAMEXSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    proyecto_nombre = serializers.CharField(source='proyecto.nombre', read_only=True)

    class Meta:
        model = TicketAMEX
        fields = '__all__'
