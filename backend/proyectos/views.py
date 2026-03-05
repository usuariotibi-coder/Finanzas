from rest_framework import viewsets

from accounts.permissions import IsAdminOrPMOrReadOnly
from viaticos.services import recalculate_all_project_spent
from .models import Proyecto
from .serializers import ProyectoSerializer


class ProyectoViewSet(viewsets.ModelViewSet):
    queryset = Proyecto.objects.all().order_by('-created_at')
    serializer_class = ProyectoSerializer
    permission_classes = [IsAdminOrPMOrReadOnly]

    def get_queryset(self):
        recalculate_all_project_spent()
        return super().get_queryset()
