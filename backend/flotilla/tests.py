from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Vehicle


User = get_user_model()


class FlotillaCreateTests(APITestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            email='flotilla.staff@na.scio-automation.com',
            full_name='Flotilla Staff',
            department='manufactura',
            position='Colaborador',
            password='SecurePass123',
        )
        self.admin_user = User.objects.create_user(
            email='flotilla.admin@na.scio-automation.com',
            full_name='Flotilla Admin',
            department='finanzas',
            position='Administrador',
            password='SecurePass123',
        )
        self.vehicle = Vehicle.objects.create(
            marca='Toyota',
            modelo='Corolla',
            anio=2023,
            placas='QA-123',
            numero_serie='SERIEQA1234567890',
            color='Blanco',
            km_actual=15000,
            status=Vehicle.Status.DISPONIBLE,
        )

    def test_staff_assignment_without_user_is_assigned_to_request_user(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post(
            '/api/flotilla/asignaciones/',
            {
                'vehicle': self.vehicle.id,
                'motivo': 'Prueba de asignacion',
                'proposito': 'operaciones',
                'fecha_inicio': '2026-02-01',
                'km_inicial': 15000,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.staff_user.id)

    def test_staff_assignment_user_spoof_is_overridden(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post(
            '/api/flotilla/asignaciones/',
            {
                'vehicle': self.vehicle.id,
                'user': self.admin_user.id,
                'motivo': 'Prueba de asignacion',
                'proposito': 'operaciones',
                'fecha_inicio': '2026-02-01',
                'km_inicial': 15000,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.staff_user.id)

    def test_admin_gasoline_load_without_user_defaults_to_request_user(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            '/api/flotilla/gasolina/',
            {
                'vehicle': self.vehicle.id,
                'fecha': '2026-02-01',
                'litros': '35.00',
                'precio_litro': '23.50',
                'total': '822.50',
                'odometro': 15100,
                'estacion': 'PEMEX QA',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.admin_user.id)
