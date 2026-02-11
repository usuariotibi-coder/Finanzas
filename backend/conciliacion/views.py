from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdminOrPMOrFinanceOrReadOnly
from .models import AlertaConciliacion, Conciliacion, Consumo, Factura
from .serializers import (
    AlertaConciliacionSerializer,
    ConciliacionSerializer,
    ConsumoSerializer,
    FacturaSerializer,
)


class FacturaViewSet(viewsets.ModelViewSet):
    queryset = Factura.objects.select_related('user', 'viatico').order_by('-created_at')
    serializer_class = FacturaSerializer
    permission_classes = [IsAdminOrPMOrFinanceOrReadOnly]


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
