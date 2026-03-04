from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from .defaults import GS_ACTIVITY_OTHER_ID, PROTECTED_DEPARTMENT_VALUES
from .models import CuentaContable, DepartmentOption, GSActivity
from .serializers import CuentaContableSerializer, DepartmentOptionSerializer, GSActivitySerializer


class AuthenticatedReadOnlyAdminFinanceWrite(permissions.BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        if request.method in permissions.SAFE_METHODS:
            return bool(user and user.is_authenticated)
        return bool(user and user.is_authenticated and user.role in ('admin', 'finance'))


class GSActivityViewSet(viewsets.ModelViewSet):
    queryset = GSActivity.objects.all().order_by('id')
    serializer_class = GSActivitySerializer
    permission_classes = [AuthenticatedReadOnlyAdminFinanceWrite]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.id == GS_ACTIVITY_OTHER_ID:
            return Response(
                {'detail': 'La actividad "Otro" no se puede eliminar.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class CuentaContableViewSet(viewsets.ModelViewSet):
    queryset = CuentaContable.objects.all().order_by('codigo')
    serializer_class = CuentaContableSerializer
    permission_classes = [AuthenticatedReadOnlyAdminFinanceWrite]
    lookup_field = 'codigo'


class DepartmentOptionViewSet(viewsets.ModelViewSet):
    queryset = DepartmentOption.objects.all().order_by('label')
    serializer_class = DepartmentOptionSerializer
    permission_classes = [AuthenticatedReadOnlyAdminFinanceWrite]
    lookup_field = 'value'

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.value in PROTECTED_DEPARTMENT_VALUES:
            return Response(
                {'detail': 'Este departamento esta protegido y no se puede eliminar.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
