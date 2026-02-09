from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.models import Role
from accounts.permissions import IsAdminOrReadOnly
from .models import (
    CargaGasolina,
    MaintenanceRecord,
    Vehicle,
    VehicleAlert,
    VehicleAssignment,
    VehicleExpense,
)
from .serializers import (
    CargaGasolinaSerializer,
    MaintenanceRecordSerializer,
    VehicleAlertSerializer,
    VehicleAssignmentSerializer,
    VehicleExpenseSerializer,
    VehicleSerializer,
)


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all().order_by('-created_at')
    serializer_class = VehicleSerializer
    permission_classes = [IsAdminOrReadOnly]


class VehicleAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = VehicleAssignment.objects.select_related('vehicle', 'user', 'proyecto', 'viatico').order_by('-created_at')
        if user.role in (Role.ADMIN, Role.PM):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        request_user = self.request.user
        payload_user = serializer.validated_data.get('user')
        if request_user.role in (Role.ADMIN, Role.PM):
            serializer.save(user=payload_user or request_user)
        else:
            serializer.save(user=request_user)


class VehicleAlertViewSet(viewsets.ModelViewSet):
    queryset = VehicleAlert.objects.select_related('vehicle').order_by('-created_at')
    serializer_class = VehicleAlertSerializer
    permission_classes = [IsAdminOrReadOnly]


class VehicleExpenseViewSet(viewsets.ModelViewSet):
    queryset = VehicleExpense.objects.select_related('vehicle', 'assignment').order_by('-created_at')
    serializer_class = VehicleExpenseSerializer
    permission_classes = [IsAdminOrReadOnly]


class CargaGasolinaViewSet(viewsets.ModelViewSet):
    serializer_class = CargaGasolinaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = CargaGasolina.objects.select_related('vehicle', 'assignment', 'user').order_by('-created_at')
        if user.role in (Role.ADMIN, Role.PM):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        request_user = self.request.user
        payload_user = serializer.validated_data.get('user')
        if request_user.role in (Role.ADMIN, Role.PM):
            serializer.save(user=payload_user or request_user)
        else:
            serializer.save(user=request_user)


class MaintenanceRecordViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRecord.objects.select_related('vehicle').order_by('-created_at')
    serializer_class = MaintenanceRecordSerializer
    permission_classes = [IsAdminOrReadOnly]
