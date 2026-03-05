from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from proyectos.models import Proyecto
from .models import SolicitudViaje


User = get_user_model()


class ViajesCreateTests(APITestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            email='viajes.staff@na.scio-automation.com',
            full_name='Viajes Staff',
            department='manufactura',
            position='Colaborador',
            password='SecurePass123',
        )
        self.admin_user = User.objects.create_user(
            email='viajes.admin@na.scio-automation.com',
            full_name='Viajes Admin',
            department='finanzas',
            position='Administrador',
            password='SecurePass123',
        )

    def test_staff_create_trip_without_user_is_assigned_to_request_user(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post(
            '/api/viajes/',
            {
                'origen': 'Monterrey',
                'destino': 'Ciudad de Mexico',
                'fecha_inicio': '2026-02-10',
                'fecha_fin': '2026-02-12',
                'motivo': 'Reunion con cliente',
                'necesita_avion': False,
                'necesita_camion': True,
                'necesita_hotel': True,
                'status': 'pendiente',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.staff_user.id)

    def test_staff_cannot_spoof_trip_user(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post(
            '/api/viajes/',
            {
                'user': self.admin_user.id,
                'origen': 'Monterrey',
                'destino': 'Ciudad de Mexico',
                'fecha_inicio': '2026-02-10',
                'fecha_fin': '2026-02-12',
                'motivo': 'Reunion con cliente',
                'necesita_avion': False,
                'necesita_camion': True,
                'necesita_hotel': True,
                'status': 'pendiente',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.staff_user.id)


class ViajesProjectSpentSyncTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='viajes.sync@na.scio-automation.com',
            full_name='Viajes Sync',
            department='operaciones',
            position='Project Manager',
            password='SecurePass123',
        )
        self.project_a = Proyecto.objects.create(
            codigo='PRJ-VIAJES-001',
            nombre='Proyecto Viajes A',
            cliente='Cliente A',
            estado='activo',
            presupuesto=10000,
            gastado=0,
            fecha_inicio='2026-01-01',
            fecha_fin_estimada='2026-12-31',
            responsable='Viajes Sync',
            departamento='operaciones',
            descripcion='Proyecto con avion',
        )
        self.project_b = Proyecto.objects.create(
            codigo='PRJ-VIAJES-002',
            nombre='Proyecto Viajes B',
            cliente='Cliente B',
            estado='activo',
            presupuesto=10000,
            gastado=0,
            fecha_inicio='2026-01-01',
            fecha_fin_estimada='2026-12-31',
            responsable='Viajes Sync',
            departamento='operaciones',
            descripcion='Proyecto con avion B',
        )

    def test_project_spent_includes_confirmed_flight_costs(self):
        SolicitudViaje.objects.create(
            user=self.user,
            proyecto=self.project_a,
            origen='Monterrey',
            destino='Ciudad de Mexico',
            fecha_inicio='2026-03-01',
            fecha_fin='2026-03-03',
            motivo='Visita con cliente',
            necesita_avion=True,
            status='en_proceso',
            status_avion='confirmado',
            confirmaciones_avion=[
                {'proveedor': 'Aeromexico', 'confirmacion': 'AM123', 'costo': 3450.25},
                {'proveedor': 'Volaris', 'confirmacion': 'VO456', 'costo': '550.75'},
            ],
        )

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('4001.00'))

    def test_project_spent_ignores_cancelled_trip_flights(self):
        SolicitudViaje.objects.create(
            user=self.user,
            proyecto=self.project_a,
            origen='Monterrey',
            destino='Ciudad de Mexico',
            fecha_inicio='2026-03-01',
            fecha_fin='2026-03-03',
            motivo='Visita con cliente',
            necesita_avion=True,
            status='cancelado',
            status_avion='confirmado',
            confirmaciones_avion=[
                {'proveedor': 'Aeromexico', 'confirmacion': 'AM123', 'costo': 3450.25},
            ],
        )

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('0.00'))

    def test_project_spent_moves_when_trip_changes_project(self):
        viaje = SolicitudViaje.objects.create(
            user=self.user,
            proyecto=self.project_a,
            origen='Monterrey',
            destino='Ciudad de Mexico',
            fecha_inicio='2026-03-01',
            fecha_fin='2026-03-03',
            motivo='Visita con cliente',
            necesita_avion=True,
            status='en_proceso',
            status_avion='confirmado',
            confirmaciones_avion=[
                {'proveedor': 'Aeromexico', 'confirmacion': 'AM123', 'costo': 2450},
            ],
        )

        viaje.proyecto = self.project_b
        viaje.save()

        self.project_a.refresh_from_db()
        self.project_b.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('0.00'))
        self.assertEqual(self.project_b.gastado, Decimal('2450.00'))

    def test_project_spent_falls_back_to_total_when_trip_is_flight_only(self):
        SolicitudViaje.objects.create(
            user=self.user,
            proyecto=self.project_a,
            origen='Monterrey',
            destino='Ciudad de Mexico',
            fecha_inicio='2026-03-01',
            fecha_fin='2026-03-03',
            motivo='Visita con cliente',
            necesita_avion=True,
            necesita_camion=False,
            necesita_hotel=False,
            status='confirmado',
            status_avion='confirmado',
            costo_final=Decimal('5120.90'),
            confirmaciones_avion=[],
        )

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('5120.90'))
