from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import IsAdminOrFinanceOrReadOnly
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
from .services import (
    ensure_expense_from_gasoline_load,
    ensure_expense_from_maintenance,
    ensure_gasoline_load_from_expense,
    ensure_maintenance_record_from_expense,
    sync_expense_mirrors,
    sync_vehicle_alerts,
)


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all().order_by('-created_at')
    serializer_class = VehicleSerializer
    permission_classes = [IsAdminOrFinanceOrReadOnly]

    def perform_create(self, serializer):
        vehicle = serializer.save()
        sync_vehicle_alerts()
        return vehicle

    def perform_update(self, serializer):
        vehicle = serializer.save()
        sync_vehicle_alerts()
        return vehicle


class VehicleAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = VehicleAssignment.objects.select_related('vehicle', 'user', 'proyecto', 'viatico').order_by('-created_at')
        if user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        request_user = self.request.user
        if not request_user.can_create_self_service_requests():
            raise PermissionDenied('Tu categoria no puede solicitar vehiculos desde este portal.')
        payload_user = serializer.validated_data.get('user')
        if request_user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            serializer.save(user=payload_user or request_user)
        else:
            serializer.save(user=request_user)

    @action(detail=True, methods=['post'], url_path='upload-entrega-fotos')
    def upload_entrega_fotos(self, request, pk=None):
        assignment = self.get_object()
        fotos = request.FILES.getlist('fotos')
        if not fotos:
            return Response({'detail': 'No se recibieron fotos para la entrega.'}, status=status.HTTP_400_BAD_REQUEST)

        checklist = assignment.checklist_entrega if isinstance(assignment.checklist_entrega, dict) else {}
        foto_names = [str(item).strip() for item in checklist.get('fotos', []) if str(item).strip()]
        foto_paths = [str(item).strip() for item in checklist.get('fotosUrls', []) if str(item).strip()]

        for foto in fotos:
            if not foto:
                continue
            assignment.foto_odometro_final = foto
            assignment.save()
            stored_path = ''
            if assignment.foto_odometro_final:
                stored_path = assignment.foto_odometro_final.url or assignment.foto_odometro_final.name
            if stored_path:
                foto_paths.append(stored_path)
                foto_names.append(foto.name)

        checklist['fotos'] = foto_names[-3:]
        checklist['fotosUrls'] = foto_paths[-3:]
        assignment.checklist_entrega = checklist
        assignment.save()
        return Response(VehicleAssignmentSerializer(assignment).data)


class VehicleAlertViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleAlertSerializer
    permission_classes = [IsAdminOrFinanceOrReadOnly]

    def get_queryset(self):
        sync_vehicle_alerts()
        return VehicleAlert.objects.select_related('vehicle').order_by('-created_at')


class VehicleExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleExpenseSerializer
    permission_classes = [IsAdminOrFinanceOrReadOnly]

    def get_queryset(self):
        sync_expense_mirrors()
        return VehicleExpense.objects.select_related('vehicle', 'assignment').order_by('-created_at')

    def perform_create(self, serializer):
        expense = serializer.save()
        ensure_gasoline_load_from_expense(expense)
        ensure_maintenance_record_from_expense(expense)
        return expense


class CargaGasolinaViewSet(viewsets.ModelViewSet):
    serializer_class = CargaGasolinaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        sync_expense_mirrors()
        user = self.request.user
        queryset = CargaGasolina.objects.select_related('vehicle', 'assignment', 'user').order_by('-created_at')
        if user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        request_user = self.request.user
        payload_user = serializer.validated_data.get('user')
        load = None
        if request_user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            load = serializer.save(user=payload_user or request_user)
        else:
            load = serializer.save(user=request_user)
        ensure_expense_from_gasoline_load(load)


class MaintenanceRecordViewSet(viewsets.ModelViewSet):
    serializer_class = MaintenanceRecordSerializer
    permission_classes = [IsAdminOrFinanceOrReadOnly]

    def get_queryset(self):
        sync_expense_mirrors()
        return MaintenanceRecord.objects.select_related('vehicle').order_by('-created_at')

    def perform_create(self, serializer):
        record = serializer.save()
        ensure_expense_from_maintenance(record)
        return record
