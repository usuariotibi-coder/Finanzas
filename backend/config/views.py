from django.db import models
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
        viaticos_activos = Viatico.objects.filter(
            status__in=['aprobado', 'dispersado', 'en_viaje', 'viaje_finalizado', 'en_recuperacion']
        ).count()
        viaticos_pendientes = Viatico.objects.filter(status='pendiente').count()
        total_dispersado = Viatico.objects.exclude(monto_dispersado__isnull=True).aggregate(total=models.Sum('monto_dispersado'))
        total_recuperar = Viatico.objects.exclude(saldo_restante__isnull=True).aggregate(total=models.Sum('saldo_restante'))
        facturas_pendientes = Factura.objects.filter(status='pendiente').count()
        alertas_conciliacion = AlertaConciliacion.objects.count()
        vehiculos_disponibles = Vehicle.objects.filter(status='disponible').count()
        vehiculos_asignados = Vehicle.objects.filter(status='asignado').count()
        alertas_mantenimiento = VehicleAlert.objects.filter(atendido=False).count()
        gastos_amex_pendientes = TicketAMEX.objects.filter(matched=False).count()

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
