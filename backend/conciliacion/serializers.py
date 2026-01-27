from rest_framework import serializers

from .models import AlertaConciliacion, Conciliacion, Consumo, Factura


class FacturaSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = Factura
        fields = '__all__'


class ConsumoSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = Consumo
        fields = '__all__'


class ConciliacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conciliacion
        fields = '__all__'


class AlertaConciliacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertaConciliacion
        fields = '__all__'
