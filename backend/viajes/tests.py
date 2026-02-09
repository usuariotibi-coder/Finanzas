from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


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
