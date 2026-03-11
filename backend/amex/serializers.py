from rest_framework import serializers

from .models import TarjetaAMEX, TicketAMEX


class TarjetaAMEXSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = TarjetaAMEX
        fields = (
            'id',
            'user',
            'user_name',
            'card_number',
            'card_holder',
            'employee_number',
            'account_number',
            'expiration_date',
            'comodin',
            'department',
            'activa',
        )

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        user = attrs.get('user', getattr(instance, 'user', None))
        comodin = attrs.get('comodin', getattr(instance, 'comodin', False))

        if not comodin and user is None:
            raise serializers.ValidationError({'user': 'Selecciona un usuario o marca la tarjeta como comodin.'})

        if not comodin and user is not None:
            duplicates = TarjetaAMEX.objects.filter(user=user, comodin=False)
            if instance is not None:
                duplicates = duplicates.exclude(pk=instance.pk)
            if duplicates.exists():
                raise serializers.ValidationError({'user': 'Este usuario ya tiene una tarjeta registrada.'})

        return attrs

    def create(self, validated_data):
        user = validated_data.get('user')
        comodin = validated_data.get('comodin', False)

        if user is not None:
            validated_data['card_holder'] = user.full_name
            validated_data['department'] = user.department
        elif comodin and not validated_data.get('card_holder'):
            validated_data['card_holder'] = 'Tarjeta comodin'

        return super().create(validated_data)

    def update(self, instance, validated_data):
        user = validated_data.get('user', instance.user)
        comodin = validated_data.get('comodin', instance.comodin)

        if user is not None:
            validated_data['card_holder'] = user.full_name
            validated_data['department'] = user.department
        elif comodin and not validated_data.get('card_holder', instance.card_holder):
            validated_data['card_holder'] = 'Tarjeta comodin'

        return super().update(instance, validated_data)


class TicketAMEXSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    proyecto_nombre = serializers.CharField(source='proyecto.nombre', read_only=True)

    class Meta:
        model = TicketAMEX
        fields = '__all__'
