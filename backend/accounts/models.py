from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Department(models.TextChoices):
    FINANZAS = 'finanzas', 'Finanzas'
    DISENO_MECANICO = 'diseno_mecanico', 'Diseno Mecanico'
    HARDWARE_DESIGN = 'hardware_design', 'Hardware Design'
    ENSAMBLE = 'ensamble', 'Ensamble'
    PROGRAMACION_PLC = 'programacion_plc', 'Programacion PLC'
    MANUFACTURA = 'manufactura', 'Manufactura'
    OTRO = 'otro', 'Otro'


class Position(models.TextChoices):
    PROJECT_MANAGER = 'project_manager', 'Project Manager'
    COLABORADOR = 'colaborador', 'Colaborador'
    OTRO = 'otro', 'Otro'


class Role(models.TextChoices):
    ADMIN = 'admin', 'Administrador'
    PM = 'pm', 'Project Manager'
    STAFF = 'staff', 'Colaborador'


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
        extra_fields.setdefault('department', Department.FINANZAS)
        extra_fields.setdefault('position', Position.OTRO)
        user = self.create_user(email, password, **extra_fields)
        user.role = Role.ADMIN
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=120)
    department = models.CharField(max_length=50, choices=Department.choices)
    position = models.CharField(max_length=50, choices=Position.choices, default=Position.COLABORADOR)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name', 'department', 'position']

    def resolve_role(self) -> str:
        if self.department == Department.FINANZAS:
            return Role.ADMIN
        if self.position == Position.PROJECT_MANAGER:
            return Role.PM
        return Role.STAFF

    def save(self, *args, **kwargs):
        self.role = self.resolve_role()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f'{self.full_name} ({self.email})'
