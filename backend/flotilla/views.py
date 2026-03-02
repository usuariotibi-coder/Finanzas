from rest_framework import status, viewsets
from rest_framework.decorators import action
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


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all().order_by('-created_at')
    serializer_class = VehicleSerializer
    permission_classes = [IsAdminOrFinanceOrReadOnly]


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
    queryset = VehicleAlert.objects.select_related('vehicle').order_by('-created_at')
    serializer_class = VehicleAlertSerializer
    permission_classes = [IsAdminOrFinanceOrReadOnly]


class VehicleExpenseViewSet(viewsets.ModelViewSet):
    queryset = VehicleExpense.objects.select_related('vehicle', 'assignment').order_by('-created_at')
    serializer_class = VehicleExpenseSerializer
    permission_classes = [IsAdminOrFinanceOrReadOnly]


class CargaGasolinaViewSet(viewsets.ModelViewSet):
    serializer_class = CargaGasolinaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = CargaGasolina.objects.select_related('vehicle', 'assignment', 'user').order_by('-created_at')
        if user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        request_user = self.request.user
        payload_user = serializer.validated_data.get('user')
        if request_user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            serializer.save(user=payload_user or request_user)
        else:
            serializer.save(user=request_user)


class MaintenanceRecordViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRecord.objects.select_related('vehicle').order_by('-created_at')
    serializer_class = MaintenanceRecordSerializer
    permission_classes = [IsAdminOrFinanceOrReadOnly]
