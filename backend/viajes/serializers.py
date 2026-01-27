from rest_framework import serializers

from .models import SolicitudViaje


class SolicitudViajeSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    proyecto_nombre = serializers.CharField(source='proyecto.nombre', read_only=True)

    class Meta:
        model = SolicitudViaje
        fields = '__all__'
