from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from amex.views import TarjetaAMEXViewSet, TicketAMEXViewSet
from conciliacion.views import (
    AlertaConciliacionViewSet,
    ConciliacionViewSet,
    ConsumoViewSet,
    FacturaViewSet,
)
from config.views import DashboardMetricsView, HealthCheckView
from dispersion.views import DispersionViewSet
from flotilla.views import (
    CargaGasolinaViewSet,
    MaintenanceRecordViewSet,
    VehicleAlertViewSet,
    VehicleAssignmentViewSet,
    VehicleExpenseViewSet,
    VehicleViewSet,
)
from proyectos.views import ProyectoViewSet
from recuperacion.views import RecuperacionViewSet
from viajes.views import SolicitudViajeViewSet
from viaticos.views import ViaticoDocumentoViewSet, ViaticoViewSet

router = DefaultRouter()
router.register('proyectos', ProyectoViewSet, basename='proyecto')
router.register('viaticos', ViaticoViewSet, basename='viatico')
router.register('viaticos-documentos', ViaticoDocumentoViewSet, basename='viatico-documento')
router.register('dispersiones', DispersionViewSet, basename='dispersion')
router.register('recuperaciones', RecuperacionViewSet, basename='recuperacion')
router.register('viajes', SolicitudViajeViewSet, basename='viaje')
router.register('flotilla/vehiculos', VehicleViewSet, basename='vehiculo')
router.register('flotilla/asignaciones', VehicleAssignmentViewSet, basename='vehiculo-asignacion')
router.register('flotilla/alertas', VehicleAlertViewSet, basename='vehiculo-alerta')
router.register('flotilla/gastos', VehicleExpenseViewSet, basename='vehiculo-gasto')
router.register('flotilla/gasolina', CargaGasolinaViewSet, basename='vehiculo-gasolina')
router.register('flotilla/mantenimiento', MaintenanceRecordViewSet, basename='vehiculo-mantenimiento')
router.register('conciliacion/facturas', FacturaViewSet, basename='conciliacion-factura')
router.register('conciliacion/consumos', ConsumoViewSet, basename='conciliacion-consumo')
router.register('conciliacion/alertas', AlertaConciliacionViewSet, basename='conciliacion-alerta')
router.register('conciliacion', ConciliacionViewSet, basename='conciliacion')
router.register('amex/tickets', TicketAMEXViewSet, basename='amex-ticket')
router.register('amex/tarjetas', TarjetaAMEXViewSet, basename='amex-tarjeta')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/health/', HealthCheckView.as_view(), name='health'),
    path('api/dashboard/metrics/', DashboardMetricsView.as_view(), name='dashboard-metrics'),
    path('api/', include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
