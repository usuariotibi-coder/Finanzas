from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import TarjetaAMEX


User = get_user_model()


class TarjetaAMEXApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='finanzas@na.scio-automation.com',
            full_name='Finanzas QA',
            department='finanzas',
            position='Analista',
            password='SecurePass123',
        )
        self.client.force_authenticate(user=self.user)

    def test_create_external_card_without_internal_user(self):
        payload = {
            'user': None,
            'card_number': '1234567812345678',
            'card_holder': 'Consultor Externo',
            'external_personnel': True,
            'external_email': 'consultor@proveedor.com',
            'employee_number': 'EXT-001',
            'account_number': '5410-0021',
            'expiration_date': '2027-12-31',
            'comodin': False,
            'department': 'Personal externo',
            'activa': True,
        }

        response = self.client.post('/api/amex/tarjetas/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        tarjeta = TarjetaAMEX.objects.get(pk=response.data['id'])
        self.assertTrue(tarjeta.external_personnel)
        self.assertEqual(tarjeta.external_email, payload['external_email'])
        self.assertIsNone(tarjeta.user)

    def test_external_card_requires_email(self):
        payload = {
            'user': None,
            'card_number': '1234567812345678',
            'card_holder': 'Consultor Externo',
            'external_personnel': True,
            'external_email': '',
            'employee_number': 'EXT-001',
            'account_number': '5410-0021',
            'expiration_date': '2027-12-31',
            'comodin': False,
            'department': 'Personal externo',
            'activa': True,
        }

        response = self.client.post('/api/amex/tarjetas/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('external_email', response.data)
