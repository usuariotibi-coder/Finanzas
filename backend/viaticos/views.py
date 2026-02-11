from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.models import Role
from .models import Viatico, ViaticoDocumento
from .serializers import ViaticoDocumentoSerializer, ViaticoSerializer


class ViaticoViewSet(viewsets.ModelViewSet):
    serializer_class = ViaticoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Viatico.objects.select_related('user', 'proyecto', 'aprobado_por').order_by('-created_at')
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


class ViaticoDocumentoViewSet(viewsets.ModelViewSet):
    serializer_class = ViaticoDocumentoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = ViaticoDocumento.objects.select_related('viatico').order_by('-created_at')
        if user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            return queryset
        return queryset.filter(viatico__user=user)
