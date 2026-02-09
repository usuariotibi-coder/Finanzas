from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.models import Role
from .models import SolicitudViaje
from .serializers import SolicitudViajeSerializer


class SolicitudViajeViewSet(viewsets.ModelViewSet):
    serializer_class = SolicitudViajeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = SolicitudViaje.objects.select_related('user', 'proyecto').order_by('-created_at')
        if user.role in (Role.ADMIN, Role.PM):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        request_user = self.request.user
        payload_user = serializer.validated_data.get('user')
        if request_user.role in (Role.ADMIN, Role.PM):
            serializer.save(user=payload_user or request_user)
        else:
            serializer.save(user=request_user)
