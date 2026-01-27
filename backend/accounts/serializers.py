from django.contrib.auth import get_user_model
from rest_framework import serializers


User = get_user_model()
ALLOWED_EMAIL_DOMAIN = 'na.scio-automation.com'


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'full_name', 'department', 'position', 'role')


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ('email', 'full_name', 'department', 'position', 'password')

    def validate_email(self, value):
        normalized = value.strip().lower()
        if '@' not in normalized:
            raise serializers.ValidationError('Ingresa un correo valido.')
        domain = normalized.split('@', 1)[1]
        if domain != ALLOWED_EMAIL_DOMAIN:
            raise serializers.ValidationError(
                f'Solo se permiten correos @{ALLOWED_EMAIL_DOMAIN}.'
            )
        return normalized

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        return user
