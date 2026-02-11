from django.contrib.auth import get_user_model
from rest_framework import serializers


User = get_user_model()
ALLOWED_EMAIL_DOMAIN = 'na.scio-automation.com'


def validate_allowed_email(value: str, instance: User | None = None) -> str:
    normalized = value.strip().lower()
    if '@' not in normalized:
        raise serializers.ValidationError('Ingresa un correo valido.')
    domain = normalized.split('@', 1)[1]
    if domain != ALLOWED_EMAIL_DOMAIN:
        raise serializers.ValidationError(
            f'Solo se permiten correos @{ALLOWED_EMAIL_DOMAIN}.'
        )
    query = User.objects.filter(email=normalized)
    if instance is not None:
        query = query.exclude(pk=instance.pk)
    if query.exists():
        raise serializers.ValidationError('Este correo ya esta registrado.')
    return normalized


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
        return validate_allowed_email(value)

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        return user


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('email', 'full_name', 'department', 'position')
        extra_kwargs = {
            'email': {'required': False},
            'full_name': {'required': False},
            'department': {'required': False},
            'position': {'required': False},
        }

    def validate_email(self, value):
        return validate_allowed_email(value, self.instance)
