from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Department, User
from amex.models import TicketAMEX
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
            monto=Decimal('120.00'),
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
        self.assertEqual(consumo.propina_detectada, Decimal('20.00'))
        self.assertEqual(consumo.propina_porcentaje, Decimal('20.00'))
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
            monto=Decimal('120.00'),
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

    def test_reconcile_factura_uses_xml_concept_amount_plus_tax_candidate(self):
        consumo = Consumo.objects.create(
            user=self.user,
            fecha='2026-03-10',
            comercio='Proveedor industrial',
            pais_comercio='Mexico',
            tipo_movimiento='Compra',
            concepto='Material',
            monto=Decimal('120.00'),
            categoria='Materiales',
            matched=False,
            autorizado=False,
        )
        factura = Factura.objects.create(
            user=self.user,
            folio='FAC-XML-CAND',
            uuid='UUID-XML-CAND',
            rfc='XAXX010101000',
            razon_social='Proveedor industrial',
            fecha='2026-03-10',
            subtotal=Decimal('100.00'),
            iva=Decimal('20.00'),
            total=Decimal('100.00'),
            forma_pago='01',
            metodo_pago='PUE',
            conceptos=[{
                'descripcion': 'Material',
                'cantidad': 1,
                'valorUnitario': 100.0,
                'importe': 100.0,
                'impuestoImporte': 20.0,
            }],
        )

        matched_consumo = reconcile_factura_with_consumos(factura)
        consumo.refresh_from_db()

        self.assertIsNotNone(matched_consumo)
        self.assertEqual(consumo.factura_id, factura.id)
        self.assertTrue(consumo.matched)

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

    def test_reconcile_factura_does_not_accept_propina_match_without_merchant_context(self):
        consumo = Consumo.objects.create(
            user=self.user,
            fecha='2026-02-15',
            comercio='HEB QRO EL REFUGIO MARQUES QR M EX',
            pais_comercio='Mexico',
            tipo_movimiento='Compra',
            concepto='Supermercado',
            monto=Decimal('526.20'),
            categoria='Alimentos',
            matched=False,
            autorizado=False,
        )
        factura = Factura.objects.create(
            user=self.user,
            folio='FAAG4199',
            uuid='46D978D7-AD38-5F5B-A373-808FFD6A0A2B',
            rfc='EAM010110EM5',
            razon_social='EVENTOS Y ALIMENTOS DE MEXICO',
            fecha='2026-02-26',
            subtotal=Decimal('419.00'),
            iva=Decimal('0.00'),
            total=Decimal('419.00'),
            forma_pago='01',
            metodo_pago='PUE',
        )

        matched_consumo = reconcile_factura_with_consumos(factura)
        consumo.refresh_from_db()

        self.assertIsNone(matched_consumo)
        self.assertIsNone(consumo.factura_id)
        self.assertFalse(consumo.matched)

    def test_reconcile_factura_allows_strict_fallback_match_by_merchant_when_amount_is_close(self):
        consumo = Consumo.objects.create(
            user=self.user,
            fecha='2026-02-08',
            comercio='FARM GUAD SUC 594 TAMOROS TAM M EX',
            pais_comercio='Mexico',
            tipo_movimiento='Compra',
            concepto='Farmacia',
            monto=Decimal('170.00'),
            categoria='Salud',
            matched=False,
            autorizado=False,
        )
        factura = Factura.objects.create(
            user=self.user,
            folio='AWW30431',
            uuid='F0154552-FF7A-48DC-AC3A-F802D96C96A5',
            rfc='FGU830930PD3',
            razon_social='FARMACIA GUADALAJARA',
            fecha='2026-02-12',
            subtotal=Decimal('206.26'),
            iva=Decimal('1.74'),
            total=Decimal('208.00'),
            forma_pago='01',
            metodo_pago='PUE',
            validacion_cfdi={
                'pdfDetectedTotal': 206.26,
                'pdfDateHints': ['2026-02-12'],
            },
        )

        matched_consumo = reconcile_factura_with_consumos(factura)
        consumo.refresh_from_db()

        self.assertIsNotNone(matched_consumo)
        self.assertEqual(consumo.factura_id, factura.id)
        self.assertTrue(consumo.matched)
        self.assertEqual(consumo.propina_detectada, Decimal('0.00'))
        self.assertEqual(consumo.propina_porcentaje, Decimal('0.00'))

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

    def test_delete_factura_cleans_related_matches(self):
        factura = Factura.objects.create(
            user=self.user,
            folio='FAC-DELETE',
            uuid='UUID-DELETE',
            rfc='XAXX010101000',
            razon_social='Office Depot Monterrey',
            fecha='2026-03-12',
            subtotal=Decimal('414.00'),
            iva=Decimal('0.00'),
            total=Decimal('414.00'),
            forma_pago='01',
            metodo_pago='PUE',
            match_consumo=True,
        )
        consumo = Consumo.objects.create(
            user=self.user,
            factura=factura,
            fecha='2026-03-12',
            comercio='Office Depot Monterrey',
            pais_comercio='Mexico',
            tipo_movimiento='Compra',
            concepto='Papeleria',
            monto=Decimal('414.00'),
            categoria='Papeleria',
            matched=True,
            autorizado=False,
            factura_pdf_name='ticket.pdf',
            factura_xml_name='ticket.xml',
        )
        ticket = TicketAMEX.objects.create(
            user=self.user,
            factura=factura,
            card_number='1001',
            card_holder='Aldo Arteaga',
            fecha='2026-03-12',
            comercio='Office Depot Monterrey',
            monto=Decimal('414.00'),
            categoria='Papeleria',
            cuenta_contable='5450',
            pais_comercio='Mexico',
            matched=True,
            autorizado=False,
            factura_pdf_name='ticket.pdf',
            factura_xml_name='ticket.xml',
            factura_notas='nota',
        )

        response = self.client.delete(f'/api/conciliacion/facturas/{factura.id}/')

        self.assertEqual(response.status_code, 204, response.data)
        self.assertFalse(Factura.objects.filter(id=factura.id).exists())
        consumo.refresh_from_db()
        ticket.refresh_from_db()
        self.assertIsNone(consumo.factura_id)
        self.assertFalse(consumo.matched)
        self.assertEqual(consumo.factura_pdf_name, '')
        self.assertEqual(consumo.factura_xml_name, '')
        self.assertIsNone(ticket.factura_id)
        self.assertFalse(ticket.matched)
        self.assertEqual(ticket.factura_pdf_name, '')
        self.assertEqual(ticket.factura_xml_name, '')
        self.assertEqual(ticket.factura_notas, '')
