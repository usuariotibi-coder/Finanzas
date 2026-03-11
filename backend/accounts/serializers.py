import re

from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
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


def validate_user_password(password: str, user_data: dict | None = None) -> str:
    checks = [
        (len(password) >= 8, 'La contrasena debe tener al menos 8 caracteres.'),
        (bool(re.search(r'[A-Z]', password)), 'La contrasena debe incluir al menos una mayuscula (A-Z).'),
        (bool(re.search(r'[a-z]', password)), 'La contrasena debe incluir al menos una minuscula (a-z).'),
        (bool(re.search(r'\d', password)), 'La contrasena debe incluir al menos un numero (0-9).'),
        (
            bool(re.search(r'[^A-Za-z0-9]', password)),
            'La contrasena debe incluir al menos un simbolo (!@#$...).',
        ),
        (not bool(re.search(r'\s', password)), 'La contrasena no puede contener espacios.'),
    ]
    explicit_errors = [message for condition, message in checks if not condition]
    if explicit_errors:
        raise serializers.ValidationError(explicit_errors)

    user_context = None
    if user_data:
        user_context = User(
            email=user_data.get('email') or '',
            full_name=user_data.get('full_name') or '',
            department=user_data.get('department') or 'finanzas',
            category=user_data.get('category') or 'operador',
            position=user_data.get('position') or 'Colaborador',
        )

    try:
        django_validate_password(password, user=user_context)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.messages)

    return password


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'full_name', 'department', 'category', 'position', 'role')


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    class Meta:
        model = User
        fields = ('email', 'full_name', 'department', 'category', 'position', 'password')
        extra_kwargs = {
            'category': {'required': False},
        }

    def validate_email(self, value):
        return validate_allowed_email(value)

    def validate(self, attrs):
        validate_user_password(attrs.get('password', ''), attrs)
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        return user


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=False,
        min_length=8,
        trim_whitespace=False,
    )

    class Meta:
        model = User
        fields = ('email', 'full_name', 'department', 'category', 'position', 'password')
        extra_kwargs = {
            'email': {'required': False},
            'full_name': {'required': False},
            'department': {'required': False},
            'category': {'required': False},
            'position': {'required': False},
        }

    def validate_email(self, value):
        return validate_allowed_email(value, self.instance)

    def validate(self, attrs):
        password = attrs.get('password')
        if password is None:
            return attrs

        user_data = {
            'email': attrs.get('email', getattr(self.instance, 'email', '')),
            'full_name': attrs.get('full_name', getattr(self.instance, 'full_name', '')),
            'department': attrs.get('department', getattr(self.instance, 'department', '')),
            'category': attrs.get('category', getattr(self.instance, 'category', 'operador')),
            'position': attrs.get('position', getattr(self.instance, 'position', '')),
        }
        validate_user_password(password, user_data)
        return attrs

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password is not None:
            instance.set_password(password)
        instance.save()
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('La contrasena actual es incorrecta.')
        return value

    def validate_new_password(self, value):
        user = self.context['request'].user
        user_data = {
            'email': getattr(user, 'email', ''),
            'full_name': getattr(user, 'full_name', ''),
            'department': getattr(user, 'department', ''),
            'category': getattr(user, 'category', 'operador'),
            'position': getattr(user, 'position', ''),
        }
        validate_user_password(value, user_data)
        return value

    def validate(self, attrs):
        if attrs['current_password'] == attrs['new_password']:
            raise serializers.ValidationError(
                {'new_password': ['La nueva contrasena debe ser diferente a la actual.']}
            )
        return attrs
