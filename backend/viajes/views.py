from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
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
        if user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            return queryset
        return queryset.filter(user=user)

    def perform_create(self, serializer):
        request_user = self.request.user
        if not request_user.can_create_self_service_requests():
            raise PermissionDenied('Tu categoria no puede solicitar viajes desde este portal.')
        payload_user = serializer.validated_data.get('user')
        if request_user.role in (Role.ADMIN, Role.FINANCE, Role.PM):
            serializer.save(user=payload_user or request_user)
        elif request_user.can_assign_self_service_requests_for_others():
            assignable_users = request_user.get_assignable_request_users()
            if payload_user and not assignable_users.filter(pk=payload_user.pk).exists():
                raise PermissionDenied('No puedes asignar viajes a este usuario.')
            serializer.save(user=payload_user or request_user)
        else:
            serializer.save(user=request_user)
