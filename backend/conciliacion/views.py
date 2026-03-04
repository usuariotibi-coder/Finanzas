from rest_framework import viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated

from accounts.models import Role
from accounts.permissions import IsAdminOrPMOrFinanceOrReadOnly
from .cfdi_parser import parse_cfdi_xml
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
        archivo_xml = serializer.validated_data.get('archivo_xml')
        cfdi_data = parse_cfdi_xml(archivo_xml) if archivo_xml else None

        extra_fields = {}
        if cfdi_data:
            if cfdi_data.subtotal is not None:
                extra_fields['subtotal'] = cfdi_data.subtotal
            if cfdi_data.iva is not None:
                extra_fields['iva'] = cfdi_data.iva
            if cfdi_data.total is not None:
                extra_fields['total'] = cfdi_data.total
            if cfdi_data.fecha is not None:
                extra_fields['fecha'] = cfdi_data.fecha
            if cfdi_data.folio:
                extra_fields['folio'] = cfdi_data.folio
            if cfdi_data.uuid:
                extra_fields['uuid'] = cfdi_data.uuid
            if cfdi_data.rfc:
                extra_fields['rfc'] = cfdi_data.rfc
            if cfdi_data.razon_social:
                extra_fields['razon_social'] = cfdi_data.razon_social
            if cfdi_data.forma_pago:
                extra_fields['forma_pago'] = cfdi_data.forma_pago
            if cfdi_data.metodo_pago:
                extra_fields['metodo_pago'] = cfdi_data.metodo_pago

        if request_user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            serializer.save(user=payload_user or request_user, **extra_fields)
        else:
            serializer.save(user=request_user, **extra_fields)


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
