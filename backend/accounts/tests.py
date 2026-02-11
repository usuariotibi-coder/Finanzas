from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class AuthFlowTests(APITestCase):
    def setUp(self):
        self.client.enforce_csrf_checks = True
        self.password = 'SecurePass123'
        self.user = User.objects.create_user(
            email='qa@na.scio-automation.com',
            full_name='QA User',
            department='finanzas',
            position='Analista',
            password=self.password,
        )

    def test_anonymous_login_without_csrf_is_allowed(self):
        no_csrf_response = self.client.post(
            '/api/auth/login/',
            {'email': self.user.email, 'password': self.password},
            format='json',
        )
        self.assertEqual(no_csrf_response.status_code, status.HTTP_200_OK)

    def test_finanzas_department_resolves_to_finance_role(self):
        self.assertEqual(self.user.role, 'finance')

    def test_csrf_login_me_logout_flow(self):
        csrf_response = self.client.get('/api/auth/csrf/')
        self.assertEqual(csrf_response.status_code, status.HTTP_200_OK)
        csrf_token = csrf_response.data.get('csrfToken')
        self.assertTrue(csrf_token)

        login_response = self.client.post(
            '/api/auth/login/',
            {'email': self.user.email, 'password': self.password},
            format='json',
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertEqual(login_response.data['email'], self.user.email)

        me_response = self.client.get('/api/auth/me/')
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data['id'], self.user.id)

        csrf_after_login = self.client.get('/api/auth/csrf/')
        self.assertEqual(csrf_after_login.status_code, status.HTTP_200_OK)
        logout_token = csrf_after_login.data.get('csrfToken')
        self.assertTrue(logout_token)

        logout_response = self.client.post(
            '/api/auth/logout/',
            {},
            format='json',
            HTTP_X_CSRFTOKEN=logout_token,
        )
        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)


class AdminRegisterTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            email='admin@na.scio-automation.com',
            full_name='Admin User',
            department='business_intelligence',
            position='Administrador',
            password='SecurePass123',
        )
        self.pm_user = User.objects.create_user(
            email='pm@na.scio-automation.com',
            full_name='PM User',
            department='operaciones',
            position='Project Manager',
            password='SecurePass123',
        )

    def test_admin_can_register_user_without_switching_session(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'email': 'nuevo.staff@na.scio-automation.com',
            'full_name': 'Nuevo Staff',
            'department': 'ensamble',
            'position': 'Tecnico',
            'password': 'SecurePass123',
        }

        response = self.client.post('/api/auth/admin/register/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(email=payload['email'])
        self.assertEqual(created.full_name, payload['full_name'])
        self.assertEqual(created.department, payload['department'])
        self.assertEqual(created.role, 'staff')

    def test_non_admin_cannot_register_users(self):
        self.client.force_authenticate(user=self.pm_user)
        payload = {
            'email': 'otro.staff@na.scio-automation.com',
            'full_name': 'Otro Staff',
            'department': 'ensamble',
            'position': 'Tecnico',
            'password': 'SecurePass123',
        }

        response = self.client.post('/api/auth/admin/register/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_register_duplicate_email(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'email': self.pm_user.email,
            'full_name': 'Duplicado',
            'department': 'operaciones',
            'position': 'PM',
            'password': 'SecurePass123',
        }

        response = self.client.post('/api/auth/admin/register/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)


class AdminUserManagementTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            email='admin.users@na.scio-automation.com',
            full_name='Admin Users',
            department='business_intelligence',
            position='Administrador',
            password='SecurePass123',
        )
        self.pm_user = User.objects.create_user(
            email='pm.users@na.scio-automation.com',
            full_name='PM Users',
            department='operaciones',
            position='Project Manager',
            password='SecurePass123',
        )
        self.staff_user = User.objects.create_user(
            email='staff.users@na.scio-automation.com',
            full_name='Staff Users',
            department='ensamble',
            position='Tecnico',
            password='SecurePass123',
        )

    def test_admin_can_list_users(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get('/api/auth/admin/users/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)

    def test_non_admin_cannot_list_users(self):
        self.client.force_authenticate(user=self.pm_user)

        response = self.client.get('/api/auth/admin/users/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_update_user(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'full_name': 'Staff Actualizado',
            'email': 'staff.actualizado@na.scio-automation.com',
            'department': 'operaciones',
            'position': 'Manager BI',
        }

        response = self.client.patch(
            f'/api/auth/admin/users/{self.staff_user.id}/',
            payload,
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.staff_user.refresh_from_db()
        self.assertEqual(self.staff_user.full_name, payload['full_name'])
        self.assertEqual(self.staff_user.email, payload['email'])
        self.assertEqual(self.staff_user.department, payload['department'])
        self.assertEqual(self.staff_user.position, payload['position'])
        self.assertEqual(self.staff_user.role, 'pm')

    def test_admin_cannot_update_to_duplicate_email(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {'email': self.pm_user.email}

        response = self.client.patch(
            f'/api/auth/admin/users/{self.staff_user.id}/',
            payload,
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
