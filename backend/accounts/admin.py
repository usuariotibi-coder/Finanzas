from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    ordering = ('email',)
    list_display = ('email', 'full_name', 'external_personnel', 'department', 'category', 'position', 'role', 'is_staff', 'is_active')
    list_filter = ('external_personnel', 'department', 'category', 'position', 'role', 'is_staff', 'is_active')
    search_fields = ('email', 'full_name')

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Perfil', {'fields': ('full_name', 'external_personnel', 'department', 'category', 'position', 'role')}),
        ('Permisos', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Fechas', {'fields': ('last_login',)}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'full_name', 'external_personnel', 'department', 'category', 'position', 'password1', 'password2', 'is_staff', 'is_active'),
        }),
    )

    readonly_fields = ('role', 'last_login')
