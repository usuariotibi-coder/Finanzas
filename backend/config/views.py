from django.db import models
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from amex.models import TicketAMEX
from conciliacion.models import AlertaConciliacion, Factura
from flotilla.models import Vehicle, VehicleAlert
from viaticos.models import Viatico


class HealthCheckView(APIView):
    permission_classes = []

    def get(self, request):
        return Response({'status': 'ok'})


class DashboardMetricsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = getattr(user, 'role', '')

        privileged_viatico_roles = {Role.ADMIN, Role.FINANCE, Role.PM}
        can_view_flotilla = role in {Role.ADMIN, Role.FINANCE}
        can_view_amex = role in {Role.ADMIN, Role.FINANCE}

        viaticos_queryset = Viatico.objects.all()
        if role not in privileged_viatico_roles:
            viaticos_queryset = viaticos_queryset.filter(user=user)

        viaticos_activos = viaticos_queryset.filter(
            status__in=['aprobado', 'dispersado', 'en_viaje', 'viaje_finalizado', 'en_recuperacion']
        ).count()
        viaticos_pendientes = viaticos_queryset.filter(status='pendiente').count()
        total_dispersado = viaticos_queryset.exclude(monto_dispersado__isnull=True).aggregate(
            total=models.Sum('monto_dispersado')
        )
        total_recuperar = viaticos_queryset.exclude(saldo_restante__isnull=True).aggregate(
            total=models.Sum('saldo_restante')
        )

        facturas_queryset = Factura.objects.all()
        if role not in privileged_viatico_roles:
            facturas_queryset = facturas_queryset.filter(user=user)
        facturas_pendientes = facturas_queryset.filter(status='pendiente').count()

        if role in privileged_viatico_roles:
            alertas_conciliacion = AlertaConciliacion.objects.count()
        else:
            alertas_conciliacion = (
                AlertaConciliacion.objects.filter(
                    models.Q(factura__user=user) | models.Q(consumo__user=user)
                )
                .distinct()
                .count()
            )

        vehiculos_disponibles = Vehicle.objects.filter(status='disponible').count() if can_view_flotilla else 0
        vehiculos_asignados = Vehicle.objects.filter(status='asignado').count() if can_view_flotilla else 0
        alertas_mantenimiento = VehicleAlert.objects.filter(atendido=False).count() if can_view_flotilla else 0
        gastos_amex_pendientes = TicketAMEX.objects.filter(matched=False).count() if can_view_amex else 0

        return Response({
            'viaticosActivos': viaticos_activos,
            'viaticosAprobacionPendiente': viaticos_pendientes,
            'totalDispersado': float(total_dispersado['total'] or 0),
            'totalRecuperar': float(total_recuperar['total'] or 0),
            'facturasPendientes': facturas_pendientes,
            'alertasConciliacion': alertas_conciliacion,
            'vehiculosDisponibles': vehiculos_disponibles,
            'vehiculosAsignados': vehiculos_asignados,
            'alertasMantenimiento': alertas_mantenimiento,
            'gastosAMEXPendientes': gastos_amex_pendientes,
        })
