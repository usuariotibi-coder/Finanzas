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
