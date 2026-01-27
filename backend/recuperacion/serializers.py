from rest_framework import serializers

from .models import Recuperacion


class RecuperacionSerializer(serializers.ModelSerializer):
    viatico_id = serializers.IntegerField(source='viatico.id', read_only=True)
    viatico_user = serializers.CharField(source='viatico.user.full_name', read_only=True)

    class Meta:
        model = Recuperacion
        fields = '__all__'
