from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from flotilla.models import CargaGasolina, Vehicle, VehicleAssignment, VehicleExpense
from flotilla.services import ensure_expense_from_gasoline_load
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
        self.gerente_user = User.objects.create_user(
            email='gerente.viaticos@na.scio-automation.com',
            full_name='Gerente Viaticos',
            department='manufactura',
            category='gerente',
            position='Gerente',
            password='SecurePass123!',
        )
        self.operador_user = User.objects.create_user(
            email='operador.viaticos@na.scio-automation.com',
            full_name='Operador Viaticos',
            department='ensamble',
            category='operador',
            position='Operador',
            password='SecurePass123!',
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

    def test_staff_operador_cannot_create_viatico(self):
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post('/api/viaticos/', self.build_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_operador_cannot_spoof_user(self):
        self.client.force_authenticate(user=self.staff_user)
        payload = self.build_payload()
        payload['user'] = self.admin_user.id
        response = self.client.post('/api/viaticos/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_gerente_create_without_user_is_assigned_to_request_user(self):
        self.client.force_authenticate(user=self.gerente_user)
        response = self.client.post('/api/viaticos/', self.build_payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.gerente_user.id)

    def test_admin_create_without_user_defaults_to_request_user(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post('/api/viaticos/', self.build_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.admin_user.id)

    def test_staff_gerente_can_create_for_operator(self):
        self.client.force_authenticate(user=self.gerente_user)
        payload = self.build_payload()
        payload['user'] = self.operador_user.id

        response = self.client.post('/api/viaticos/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.operador_user.id)

    def test_staff_gerente_cannot_assign_viatico_to_finance_user(self):
        self.client.force_authenticate(user=self.gerente_user)
        payload = self.build_payload()
        payload['user'] = self.admin_user.id

        response = self.client.post('/api/viaticos/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


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
        self.vehicle = Vehicle.objects.create(
            marca='Nissan',
            modelo='Versa',
            anio=2024,
            placas='SYNC-001',
            numero_serie='SYNC-SERIE-0001',
            color='Gris',
            km_actual=12000,
            status=Vehicle.Status.DISPONIBLE,
        )

    def test_pending_viatico_does_not_count_until_approved(self):
        Viatico.objects.create(
            user=self.user,
            proyecto=self.project_a,
            motivo='Viatico A',
            destino='Monterrey',
            fecha_inicio='2026-02-01',
            fecha_fin='2026-02-03',
            monto_solicitado=1000,
            status=Viatico.Status.PENDIENTE,
        )

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('0.00'))

    def test_project_spent_counts_approved_amount(self):
        Viatico.objects.create(
            user=self.user,
            proyecto=self.project_a,
            motivo='Viatico A',
            destino='Monterrey',
            fecha_inicio='2026-02-01',
            fecha_fin='2026-02-03',
            monto_solicitado=1000,
            monto_aprobado=Decimal('350.40'),
            status=Viatico.Status.APROBADO,
        )

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('350.40'))

    def test_project_spent_falls_back_to_requested_amount_if_approved_amount_missing(self):
        Viatico.objects.create(
            user=self.user,
            proyecto=self.project_a,
            motivo='Viatico A',
            destino='Monterrey',
            fecha_inicio='2026-02-01',
            fecha_fin='2026-02-03',
            monto_solicitado=Decimal('925.55'),
            status=Viatico.Status.APROBADO,
        )

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('925.55'))

    def test_project_spent_updates_when_status_changes_to_approved(self):
        viatico = Viatico.objects.create(
            user=self.user,
            proyecto=self.project_a,
            motivo='Viatico A',
            destino='Monterrey',
            fecha_inicio='2026-02-01',
            fecha_fin='2026-02-03',
            monto_solicitado=1000,
            status=Viatico.Status.PENDIENTE,
        )

        viatico.status = Viatico.Status.APROBADO
        viatico.monto_aprobado = Decimal('880.90')
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
            monto_aprobado=Decimal('200.00'),
            status=Viatico.Status.APROBADO,
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
            monto_aprobado=Decimal('510.00'),
            status=Viatico.Status.APROBADO,
        )

        viatico.delete()

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('0.00'))

    def test_project_spent_includes_vehicle_expenses(self):
        assignment = VehicleAssignment.objects.create(
            vehicle=self.vehicle,
            user=self.user,
            proyecto=self.project_a,
            motivo='Salida de operacion',
            proposito=VehicleAssignment.Proposito.OPERACIONES,
            fecha_inicio='2026-02-10',
            km_inicial=12000,
            status=VehicleAssignment.Status.ASIGNADO,
        )

        VehicleExpense.objects.create(
            vehicle=self.vehicle,
            assignment=assignment,
            tipo=VehicleExpense.Tipo.GASOLINA,
            fecha='2026-02-10',
            monto=Decimal('780.50'),
            descripcion='Carga de gasolina',
            proveedor='PEMEX',
        )

        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('780.50'))

    def test_project_spent_updates_when_vehicle_expense_changes_project(self):
        assignment = VehicleAssignment.objects.create(
            vehicle=self.vehicle,
            user=self.user,
            proyecto=self.project_a,
            motivo='Salida de operacion',
            proposito=VehicleAssignment.Proposito.OPERACIONES,
            fecha_inicio='2026-02-10',
            km_inicial=12000,
            status=VehicleAssignment.Status.ASIGNADO,
        )
        expense = VehicleExpense.objects.create(
            vehicle=self.vehicle,
            assignment=assignment,
            tipo=VehicleExpense.Tipo.GASOLINA,
            fecha='2026-02-10',
            monto=Decimal('600.00'),
            descripcion='Carga de gasolina',
            proveedor='PEMEX',
        )

        assignment.proyecto = self.project_b
        assignment.save()

        self.project_a.refresh_from_db()
        self.project_b.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('0.00'))
        self.assertEqual(self.project_b.gastado, Decimal('600.00'))
        self.assertEqual(expense.assignment_id, assignment.id)

    def test_project_spent_counts_gasoline_loads_via_vehicle_expense_sync(self):
        assignment = VehicleAssignment.objects.create(
            vehicle=self.vehicle,
            user=self.user,
            proyecto=self.project_a,
            motivo='Salida de operacion',
            proposito=VehicleAssignment.Proposito.OPERACIONES,
            fecha_inicio='2026-02-10',
            km_inicial=12000,
            status=VehicleAssignment.Status.ASIGNADO,
        )

        load = CargaGasolina.objects.create(
            vehicle=self.vehicle,
            assignment=assignment,
            user=self.user,
            fecha='2026-02-10',
            litros=Decimal('30.00'),
            precio_litro=Decimal('25.00'),
            total=Decimal('750.00'),
            odometro=12100,
            estacion='PEMEX',
        )
        ensure_expense_from_gasoline_load(load)

        self.assertEqual(VehicleExpense.objects.filter(assignment=assignment, tipo='gasolina').count(), 1)
        self.project_a.refresh_from_db()
        self.assertEqual(self.project_a.gastado, Decimal('750.00'))
