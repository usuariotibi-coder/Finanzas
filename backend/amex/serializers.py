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
            'external_personnel',
            'external_email',
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
        external_personnel = attrs.get('external_personnel', getattr(instance, 'external_personnel', False))
        external_email = str(attrs.get('external_email', getattr(instance, 'external_email', ''))).strip()
        card_holder = str(attrs.get('card_holder', getattr(instance, 'card_holder', ''))).strip()

        if external_personnel and user is not None:
            raise serializers.ValidationError({'user': 'Las tarjetas de personal externo no deben vincularse a un usuario interno.'})

        if external_personnel and not card_holder:
            raise serializers.ValidationError({'card_holder': 'Captura el nombre del titular externo.'})

        if external_personnel and not external_email:
            raise serializers.ValidationError({'external_email': 'Captura el correo del personal externo.'})

        if not comodin and not external_personnel and user is None:
            raise serializers.ValidationError({'user': 'Selecciona un usuario o marca la tarjeta como comodin.'})

        if not comodin and not external_personnel and user is not None:
            duplicates = TarjetaAMEX.objects.filter(user=user, comodin=False)
            if instance is not None:
                duplicates = duplicates.exclude(pk=instance.pk)
            if duplicates.exists():
                raise serializers.ValidationError({'user': 'Este usuario ya tiene una tarjeta registrada.'})

        if not external_personnel:
            attrs['external_email'] = ''

        return attrs

    def create(self, validated_data):
        user = validated_data.get('user')
        comodin = validated_data.get('comodin', False)
        external_personnel = validated_data.get('external_personnel', False)

        if user is not None:
            validated_data['card_holder'] = user.full_name
            validated_data['department'] = user.department
            validated_data['external_personnel'] = False
            validated_data['external_email'] = ''
        elif external_personnel:
            validated_data['department'] = validated_data.get('department') or 'Personal externo'
        elif comodin and not validated_data.get('card_holder'):
            validated_data['card_holder'] = 'Tarjeta comodin'

        return super().create(validated_data)

    def update(self, instance, validated_data):
        user = validated_data.get('user', instance.user)
        comodin = validated_data.get('comodin', instance.comodin)
        external_personnel = validated_data.get('external_personnel', instance.external_personnel)

        if user is not None:
            validated_data['card_holder'] = user.full_name
            validated_data['department'] = user.department
            validated_data['external_personnel'] = False
            validated_data['external_email'] = ''
        elif external_personnel:
            validated_data['department'] = validated_data.get('department') or instance.department or 'Personal externo'
        elif comodin and not validated_data.get('card_holder', instance.card_holder):
            validated_data['card_holder'] = 'Tarjeta comodin'
            validated_data['external_email'] = ''

        return super().update(instance, validated_data)


class TicketAMEXSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    proyecto_nombre = serializers.CharField(source='proyecto.nombre', read_only=True)

    class Meta:
        model = TicketAMEX
        fields = '__all__'
