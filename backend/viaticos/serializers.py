from rest_framework import serializers

from .models import Viatico, ViaticoDocumento


class ViaticoSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    proyecto_nombre = serializers.CharField(source='proyecto.nombre', read_only=True)
    aprobado_por_nombre = serializers.CharField(source='aprobado_por.full_name', read_only=True)

    class Meta:
        model = Viatico
        fields = '__all__'
        extra_kwargs = {
            'user': {'required': False},
        }


class ViaticoDocumentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ViaticoDocumento
        fields = '__all__'
