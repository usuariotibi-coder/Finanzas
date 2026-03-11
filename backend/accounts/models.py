from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Department(models.TextChoices):
    FINANZAS = 'finanzas', 'Finanzas'
    OPERACIONES = 'operaciones', 'Operaciones'
    BUSINESS_INTELLIGENCE = 'business_intelligence', 'Business Intelligence'
    DISENO_MECANICO = 'diseno_mecanico', 'Diseno Mecanico'
    HARDWARE_DESIGN = 'hardware_design', 'Hardware Design'
    ENSAMBLE = 'ensamble', 'Ensamble'
    PROGRAMACION_PLC = 'programacion_plc', 'Programacion PLC'
    MANUFACTURA = 'manufactura', 'Manufactura'
    OTRO = 'otro', 'Otro'


class Role(models.TextChoices):
    ADMIN = 'admin', 'Administrador'
    FINANCE = 'finance', 'Finanzas'
    PM = 'pm', 'Operaciones'
    STAFF = 'staff', 'Colaborador'


class Category(models.TextChoices):
    GERENTE = 'gerente', 'Gerente'
    OPERADOR = 'operador', 'Operador'


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('El email es obligatorio')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.role = user.resolve_role()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('department', Department.BUSINESS_INTELLIGENCE)
        extra_fields.setdefault('position', 'Administrador')
        user = self.create_user(email, password, **extra_fields)
        user.role = Role.ADMIN
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=120)
    department = models.CharField(max_length=50)
    category = models.CharField(max_length=50, default=Category.OPERADOR)
    position = models.CharField(max_length=50, default='Colaborador')
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name', 'department', 'position']

    def resolve_role(self) -> str:
        if self.department == Department.BUSINESS_INTELLIGENCE:
            return Role.ADMIN
        if self.department == Department.FINANZAS:
            return Role.FINANCE
        if self.department == Department.OPERACIONES:
            return Role.PM
        return Role.STAFF

    def save(self, *args, **kwargs):
        self.role = self.resolve_role()
        super().save(*args, **kwargs)

    def can_create_self_service_requests(self) -> bool:
        return not (self.role == Role.STAFF and self.category == Category.OPERADOR)

    def can_assign_self_service_requests_for_others(self) -> bool:
        return self.role in (Role.ADMIN, Role.FINANCE, Role.PM) or (
            self.role == Role.STAFF and self.category == Category.GERENTE
        )

    def get_assignable_request_users(self):
        queryset = type(self).objects.filter(is_active=True).order_by('full_name', 'email')
        if self.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            return queryset
        if self.role == Role.STAFF and self.category == Category.GERENTE:
            return queryset.filter(role=Role.STAFF)
        return queryset.filter(pk=self.pk)

    def __str__(self) -> str:
        return f'{self.full_name} ({self.email})'
