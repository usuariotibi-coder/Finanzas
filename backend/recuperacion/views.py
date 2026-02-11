from rest_framework import viewsets

from accounts.permissions import IsAdminOrFinance
from .models import Recuperacion
from .serializers import RecuperacionSerializer


class RecuperacionViewSet(viewsets.ModelViewSet):
    queryset = Recuperacion.objects.select_related('viatico', 'created_by').order_by('-created_at')
    serializer_class = RecuperacionSerializer
    permission_classes = [IsAdminOrFinance]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
