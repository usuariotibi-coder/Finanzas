from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class ViaticoMealConfigTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            email='catalog.admin@na.scio-automation.com',
            full_name='Catalog Admin',
            department='business_intelligence',
            position='Administrador',
            password='SecurePass123!',
        )
        self.staff_user = User.objects.create_user(
            email='catalog.staff@na.scio-automation.com',
            full_name='Catalog Staff',
            department='manufactura',
            position='Colaborador',
            password='SecurePass123!',
        )

    def test_authenticated_user_can_get_viatico_meal_config(self):
        self.client.force_authenticate(user=self.staff_user)

        response = self.client.get('/api/catalogos/tarifas-viaticos/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data['desayuno']), '150.00')
        self.assertEqual(str(response.data['comida']), '200.00')
        self.assertEqual(str(response.data['cena']), '250.00')

    def test_admin_can_update_viatico_meal_config(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.patch(
            '/api/catalogos/tarifas-viaticos/',
            {
                'desayuno': '180.00',
                'comida': '240.00',
                'cena': '320.00',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data['desayuno']), '180.00')
        self.assertEqual(str(response.data['comida']), '240.00')
        self.assertEqual(str(response.data['cena']), '320.00')

    def test_staff_cannot_update_viatico_meal_config(self):
        self.client.force_authenticate(user=self.staff_user)

        response = self.client.patch(
            '/api/catalogos/tarifas-viaticos/',
            {'desayuno': '180.00'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
