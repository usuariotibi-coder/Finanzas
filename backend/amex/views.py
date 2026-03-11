from rest_framework import viewsets

from accounts.permissions import IsAdminOrFinance
from .models import TarjetaAMEX, TicketAMEX
from .serializers import TarjetaAMEXSerializer, TicketAMEXSerializer


class TicketAMEXViewSet(viewsets.ModelViewSet):
    queryset = TicketAMEX.objects.select_related('user', 'proyecto', 'factura').order_by('-created_at')
    serializer_class = TicketAMEXSerializer
    permission_classes = [IsAdminOrFinance]


class TarjetaAMEXViewSet(viewsets.ModelViewSet):
    queryset = TarjetaAMEX.objects.select_related('user').order_by('card_holder', 'card_number')
    serializer_class = TarjetaAMEXSerializer
    permission_classes = [IsAdminOrFinance]
