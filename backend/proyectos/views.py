from rest_framework import viewsets

from accounts.permissions import IsAdminOrPM
from .models import Proyecto
from .serializers import ProyectoSerializer


class ProyectoViewSet(viewsets.ModelViewSet):
    queryset = Proyecto.objects.all().order_by('-created_at')
    serializer_class = ProyectoSerializer
    permission_classes = [IsAdminOrPM]
