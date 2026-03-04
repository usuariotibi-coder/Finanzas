from django.contrib import admin

from .models import CuentaContable, DepartmentOption, GSActivity


@admin.register(GSActivity)
class GSActivityAdmin(admin.ModelAdmin):
    list_display = ('id', 'label', 'account', 'code', 'category', 'proyecto_requerido')
    list_filter = ('category', 'proyecto_requerido')
    search_fields = ('label', 'account', 'code', 'note')


@admin.register(CuentaContable)
class CuentaContableAdmin(admin.ModelAdmin):
    list_display = ('codigo', 'nombre', 'categoria', 'proyecto_requerido', 'activa')
    list_filter = ('categoria', 'proyecto_requerido', 'activa')
    search_fields = ('codigo', 'nombre', 'descripcion')


@admin.register(DepartmentOption)
class DepartmentOptionAdmin(admin.ModelAdmin):
    list_display = ('label', 'value')
    search_fields = ('label', 'value')
