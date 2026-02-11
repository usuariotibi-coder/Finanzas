from rest_framework import viewsets

from accounts.permissions import IsAdminOrFinance
from .models import Dispersion
from .serializers import DispersionSerializer


class DispersionViewSet(viewsets.ModelViewSet):
    queryset = Dispersion.objects.select_related('viatico', 'created_by').order_by('-created_at')
    serializer_class = DispersionSerializer
    permission_classes = [IsAdminOrFinance]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
