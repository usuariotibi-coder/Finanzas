from rest_framework import serializers

from .models import CuentaContable, DepartmentOption, GSActivity


class GSActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = GSActivity
        fields = ('id', 'label', 'account', 'code', 'category', 'proyecto_requerido', 'note')


class CuentaContableSerializer(serializers.ModelSerializer):
    keywords = serializers.ListField(child=serializers.CharField(), allow_empty=True)

    class Meta:
        model = CuentaContable
        fields = (
            'codigo',
            'nombre',
            'descripcion',
            'categoria',
            'proyecto_requerido',
            'keywords',
            'activa',
        )


class DepartmentOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DepartmentOption
        fields = ('id', 'value', 'label')

    def validate_value(self, value: str):
        normalized = value.strip().lower()
        if not normalized:
            raise serializers.ValidationError('El valor interno no puede ir vacio.')
        return normalized
