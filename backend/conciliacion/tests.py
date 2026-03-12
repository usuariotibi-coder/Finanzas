from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Department, User
from conciliacion.matching import diagnose_factura_candidates, reconcile_factura_with_consumos
from conciliacion.models import Consumo, Factura
from conciliacion.pdf_parser import extract_pdf_structured_hints


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
                'pdfDetectedTotal': 130.0,
                'pdfDetectedRazonSocial': 'Tacos Don Pepe Centro',
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

    def test_extract_pdf_structured_hints_detects_key_fields(self):
        hints = extract_pdf_structured_hints(
            '\n'.join([
                'Nombre o razon social: EVENTOS Y ALIMENTOS DE MEXICO',
                'RFC: EAM010110EM5',
                'Folio: FAAG3989',
                'UUID: 071DC4F2-2EAE-522C-9A1B-1234567890AB',
                'Fecha: 16/02/2026',
                'Total: 414.00',
            ])
        )

        self.assertEqual(hints.get('pdfDetectedRazonSocial'), 'EVENTOS Y ALIMENTOS DE MEXICO')
        self.assertEqual(hints.get('pdfDetectedRfc'), 'EAM010110EM5')
        self.assertEqual(hints.get('pdfDetectedFolio'), 'FAAG3989')
        self.assertEqual(hints.get('pdfDetectedUuid'), '071DC4F2-2EAE-522C-9A1B-1234567890AB')
        self.assertEqual(hints.get('pdfDetectedTotal'), 414.0)
        self.assertEqual(hints.get('pdfDateHints'), ['2026-02-16'])

    def test_extract_pdf_structured_hints_ignores_numeric_certificate_as_razon_social(self):
        hints = extract_pdf_structured_hints(
            '\n'.join([
                'Razon social emisor:',
                '00001000000713776116',
                'RFC: IME120610FQA',
                'Total: 119.01',
            ])
        )

        self.assertIsNone(hints.get('pdfDetectedRazonSocial'))
        self.assertEqual(hints.get('pdfDetectedRfc'), 'IME120610FQA')
        self.assertEqual(hints.get('pdfDetectedTotal'), 119.01)

    def test_extract_pdf_structured_hints_prefers_largest_total_candidate(self):
        hints = extract_pdf_structured_hints(
            '\n'.join([
                'Version 1.0',
                'SubTotal: 361.21',
                'Impuestos Total: 57.79',
                'Total: 419.00',
            ])
        )

        self.assertEqual(hints.get('pdfDetectedTotal'), 419.0)

    def test_diagnose_factura_candidates_reports_match_reasons(self):
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
            folio='FAC-DIAG',
            uuid='UUID-DIAG',
            rfc='XAXX010101000',
            razon_social='Servicios Alimenticios del Norte',
            fecha='2026-03-02',
            subtotal=Decimal('100.00'),
            iva=Decimal('0.00'),
            total=Decimal('100.00'),
            forma_pago='01',
            metodo_pago='PUE',
            validacion_cfdi={
                'pdfDetectedTotal': 130.0,
                'pdfDetectedRazonSocial': 'Tacos Don Pepe Centro',
                'pdfDateHints': ['2026-03-10'],
            },
        )

        diagnostics = diagnose_factura_candidates(factura, limit=3)

        self.assertEqual(len(diagnostics), 1)
        self.assertEqual(diagnostics[0].consumo.id, consumo.id)
        self.assertTrue(diagnostics[0].accepted)
        self.assertEqual(diagnostics[0].match_result.match_type, 'propina')

    def test_reconcile_factura_does_not_block_match_by_invoice_date_distance(self):
        consumo = Consumo.objects.create(
            user=self.user,
            fecha='2026-03-25',
            comercio='CADENA COMERCIAL OXXO',
            pais_comercio='Mexico',
            tipo_movimiento='Compra',
            concepto='Snack',
            monto=Decimal('119.01'),
            categoria='Alimentos',
            matched=False,
            autorizado=False,
        )
        factura = Factura.objects.create(
            user=self.user,
            folio='FAC-FECHA',
            uuid='UUID-FECHA',
            rfc='XAXX010101000',
            razon_social='CADENA COMERCIAL OXXO',
            fecha='2026-02-16',
            subtotal=Decimal('119.01'),
            iva=Decimal('0.00'),
            total=Decimal('119.01'),
            forma_pago='01',
            metodo_pago='PUE',
        )

        matched_consumo = reconcile_factura_with_consumos(factura)
        consumo.refresh_from_db()

        self.assertIsNotNone(matched_consumo)
        self.assertEqual(consumo.factura_id, factura.id)
        self.assertTrue(consumo.matched)

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
