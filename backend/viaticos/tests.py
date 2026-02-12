from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from proyectos.models import Proyecto
from .models import Viatico


User = get_user_model()


class ViaticoCreateTests(APITestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            email='staff@na.scio-automation.com',
            full_name='Staff User',
            department='manufactura',
            position='Colaborador',
            password='SecurePass123',
        )
        self.admin_user = User.objects.create_user(
            email='admin@na.scio-automation.com',
            full_name='Admin User',
            department='finanzas',
            position='Administrador',
            password='SecurePass123',
        )
        self.project = Proyecto.objects.create(
            codigo='PRJ-QA-001',
            nombre='Proyecto QA',
            cliente='Cliente QA',
            estado='activo',
            presupuesto=1000,
            gastado=0,
            fecha_inicio='2026-01-01',
            fecha_fin_estimada='2026-12-31',
            responsable='Admin User',
            departamento='finanzas',
            descripcion='Prueba',
        )

    def build_payload(self):
        return {
            'proyecto': self.project.id,
            'motivo': 'Viaje de prueba',
            'destino': 'Monterrey',
            'fecha_inicio': '2026-02-01',
            'fecha_fin': '2026-02-03',
            'monto_solicitado': '1000.00',
            'status': Viatico.Status.PENDIENTE,
        }

    def test_staff_create_without_user_is_assigned_to_request_user(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post('/api/viaticos/', self.build_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.staff_user.id)

    def test_staff_cannot_spoof_user(self):
        self.client.force_authenticate(user=self.staff_user)
        payload = self.build_payload()
        payload['user'] = self.admin_user.id
        response = self.client.post('/api/viaticos/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.staff_user.id)

    def test_admin_create_without_user_defaults_to_request_user(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post('/api/viaticos/', self.build_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.admin_user.id)


class ProyectoGastadoSyncTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='sync@na.scio-automation.com',
            full_name='Sync User',
            department='operaciones',
            position='Project Manager',
            password='SecurePass123',
        )
        self.project_a = Proyecto.objects.create(
            codigo='PRJ-SYNC-001',
            nombre='Proyecto Sync A',
            cliente='Cliente A',
            estado='activo',
            presupuesto=10000,
            gastado=0,
            fecha_inicio='2026-01-01',
            fecha_fin_estimada='2026-12-31',
            responsable='Sync User',
            departamento='operaciones',
            descripcion='Sincronizacion A',
        )
        self.project_b = Proyecto.objects.create(
            codigo='PRJ-SYNC-002',
            nombre='Proyecto Sync B',
            cliente='Cliente B',
            estado='activo',
            presupuesto=10000,
            gastado=0,
            fecha_inicio='2026-01-01',
            fecha_fin_estimada='2026-12-31',
            responsable='Sync User',
            departamento='operaciones',
            descripcion='Sincronizacion B',
        )

    def test_project_spent_is_updated_on_create(self):
        Viatico.objects.create(
            user=self.user,
            proyecto=self.project_a,
            motivo='Viatico A',
            destino='Monterrey',
            fecha_inicio='2026-02-01',
            fecha_fin='2026-02-03',
            monto_solicitado=1000,
            monto_gastado=Decimal('350.40'),
            status=Viatico.Status.PENDIENTE,
        )

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('350.40'))

    def test_project_spent_is_updated_on_monto_gastado_change(self):
        viatico = Viatico.objects.create(
            user=self.user,
            proyecto=self.project_a,
            motivo='Viatico A',
            destino='Monterrey',
            fecha_inicio='2026-02-01',
            fecha_fin='2026-02-03',
            monto_solicitado=1000,
            monto_gastado=Decimal('100.00'),
            status=Viatico.Status.PENDIENTE,
        )

        viatico.monto_gastado = Decimal('880.90')
        viatico.save()

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('880.90'))

    def test_project_spent_is_updated_when_viatico_changes_project(self):
        viatico = Viatico.objects.create(
            user=self.user,
            proyecto=self.project_a,
            motivo='Viatico A',
            destino='Monterrey',
            fecha_inicio='2026-02-01',
            fecha_fin='2026-02-03',
            monto_solicitado=1000,
            monto_gastado=Decimal('200.00'),
            status=Viatico.Status.PENDIENTE,
        )

        viatico.proyecto = self.project_b
        viatico.save()

        self.project_a.refresh_from_db()
        self.project_b.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('0.00'))
        self.assertEqual(self.project_b.gastado, Decimal('200.00'))

    def test_project_spent_is_updated_on_delete(self):
        viatico = Viatico.objects.create(
            user=self.user,
            proyecto=self.project_a,
            motivo='Viatico A',
            destino='Monterrey',
            fecha_inicio='2026-02-01',
            fecha_fin='2026-02-03',
            monto_solicitado=1000,
            monto_gastado=Decimal('510.00'),
            status=Viatico.Status.PENDIENTE,
        )

        viatico.delete()

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('0.00'))
