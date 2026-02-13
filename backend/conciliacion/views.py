from rest_framework import viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated

from accounts.models import Role
from accounts.permissions import IsAdminOrPMOrFinanceOrReadOnly
from .models import AlertaConciliacion, Conciliacion, Consumo, Factura
from .serializers import (
    AlertaConciliacionSerializer,
    ConciliacionSerializer,
    ConsumoSerializer,
    FacturaSerializer,
)


class FacturaViewSet(viewsets.ModelViewSet):
    serializer_class = FacturaSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        queryset = Factura.objects.select_related('user', 'viatico').order_by('-created_at')
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


class ConsumoViewSet(viewsets.ModelViewSet):
    queryset = Consumo.objects.select_related('user', 'viatico', 'factura').order_by('-created_at')
    serializer_class = ConsumoSerializer
    permission_classes = [IsAdminOrPMOrFinanceOrReadOnly]


class ConciliacionViewSet(viewsets.ModelViewSet):
    queryset = Conciliacion.objects.all().order_by('-created_at')
    serializer_class = ConciliacionSerializer
    permission_classes = [IsAuthenticated]


class AlertaConciliacionViewSet(viewsets.ModelViewSet):
    queryset = AlertaConciliacion.objects.select_related('conciliacion', 'factura', 'consumo').order_by('-created_at')
    serializer_class = AlertaConciliacionSerializer
    permission_classes = [IsAuthenticated]
