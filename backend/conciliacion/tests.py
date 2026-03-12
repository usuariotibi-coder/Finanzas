from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Department, User
from conciliacion.matching import reconcile_factura_with_consumos
from conciliacion.models import Consumo, Factura


class ConciliacionMatchingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='armando@example.com',
            password='secret123',
            full_name='Armando Yerbafria',
            department=Department.MANUFACTURA,
            position='Operador',
        )

    def test_reconcile_factura_uses_pdf_hints_to_match_consumo(self):
        consumo = Consumo.objects.create(
            user=self.user,
            fecha='2026-03-10',
            comercio='Tacos Don Pepe Centro',
            pais_comercio='Mexico',
            tipo_movimiento='Compra',
            concepto='Alimentos',
            monto=Decimal('130.00'),
            categoria='Alimentos',
            matched=False,
            autorizado=False,
        )
        factura = Factura.objects.create(
            user=self.user,
            folio='FAC-100',
            uuid='UUID-100',
            rfc='XAXX010101000',
            razon_social='Servicios Alimenticios del Norte',
            fecha='2026-03-02',
            subtotal=Decimal('100.00'),
            iva=Decimal('0.00'),
            total=Decimal('100.00'),
            forma_pago='01',
            metodo_pago='PUE',
            validacion_cfdi={
                'pdfPreviewText': 'Consumo en Tacos Don Pepe Centro ticket 456',
                'pdfDateHints': ['2026-03-10'],
            },
            conceptos=[{'descripcion': 'Consumo restaurante'}],
        )

        matched_consumo = reconcile_factura_with_consumos(factura)
        consumo.refresh_from_db()
        factura.refresh_from_db()

        self.assertIsNotNone(matched_consumo)
        self.assertEqual(consumo.factura_id, factura.id)
        self.assertTrue(consumo.matched)
        self.assertEqual(consumo.propina_detectada, Decimal('30.00'))
        self.assertEqual(consumo.propina_porcentaje, Decimal('30.00'))
        self.assertTrue(factura.match_consumo)


class FacturaViewSetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='aldo@example.com',
            password='secret123',
            full_name='Aldo Arteaga',
            department=Department.MANUFACTURA,
            position='Operador',
        )
        self.client.force_authenticate(self.user)

    def test_create_factura_auto_reconciles_matching_consumo(self):
        consumo = Consumo.objects.create(
            user=self.user,
            fecha='2026-03-12',
            comercio='Office Depot Monterrey',
            pais_comercio='Mexico',
            tipo_movimiento='Compra',
            concepto='Papeleria',
            monto=Decimal('414.00'),
            categoria='Papeleria',
            matched=False,
            autorizado=False,
        )

        response = self.client.post(
            '/api/conciliacion/facturas/',
            {
                'folio': 'FAC-POST',
                'uuid': 'UUID-POST',
                'rfc': 'XAXX010101000',
                'razon_social': 'Office Depot Monterrey',
                'fecha': '2026-03-12',
                'subtotal': '414.00',
                'iva': '0.00',
                'total': '414.00',
                'forma_pago': '01',
                'metodo_pago': 'PUE',
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, 201, response.data)
        factura = Factura.objects.get(id=response.data['id'])
        consumo.refresh_from_db()

        self.assertEqual(consumo.factura_id, factura.id)
        self.assertTrue(consumo.matched)
        self.assertTrue(factura.match_consumo)
