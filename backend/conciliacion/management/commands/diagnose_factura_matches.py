from django.core.management.base import BaseCommand

from conciliacion.matching import diagnose_factura_candidates
from conciliacion.models import Factura


class Command(BaseCommand):
    help = 'Diagnostica por que una factura no concilia mostrando candidatos y motivos de descarte.'

    def add_arguments(self, parser):
        parser.add_argument('--factura-id', type=int, help='Diagnostica una factura especifica por ID.')
        parser.add_argument(
            '--only-unmatched',
            action='store_true',
            help='Solo diagnostica facturas sin match.',
        )
        parser.add_argument(
            '--facturas',
            type=int,
            default=3,
            help='Numero maximo de facturas a mostrar.',
        )
        parser.add_argument(
            '--candidatos',
            type=int,
            default=5,
            help='Numero maximo de consumos candidatos por factura.',
        )

    def handle(self, *args, **options):
        queryset = Factura.objects.select_related('user', 'viatico').order_by('-created_at')
        if options['factura_id']:
            queryset = queryset.filter(id=options['factura_id'])
        elif options['only_unmatched']:
            queryset = queryset.filter(match_consumo=False)

        facturas = list(queryset[: options['facturas']])
        if not facturas:
            self.stdout.write('No se encontraron facturas para diagnosticar.')
            return

        for factura in facturas:
            validacion = factura.validacion_cfdi or {}
            self.stdout.write('=' * 72)
            self.stdout.write(
                f'Factura {factura.id} | Usuario: {factura.user.full_name} | Fecha: {factura.fecha} | Total XML: {factura.total}'
            )
            self.stdout.write(f'Razon social XML: {factura.razon_social}')
            self.stdout.write(
                'PDF detectado: '
                f"total={validacion.get('pdfDetectedTotal')}, "
                f"rfc={validacion.get('pdfDetectedRfc')}, "
                f"folio={validacion.get('pdfDetectedFolio')}, "
                f"uuid={validacion.get('pdfDetectedUuid')}, "
                f"razon_social={validacion.get('pdfDetectedRazonSocial')}, "
                f"fechas={validacion.get('pdfDateHints')}"
            )
            diagnostics = diagnose_factura_candidates(factura, limit=options['candidatos'])
            if not diagnostics:
                self.stdout.write('Sin consumos candidatos para este usuario/filtro.')
                continue

            for diagnostic in diagnostics:
                consumo = diagnostic.consumo
                amount_summary = '; '.join(
                    [
                        (
                            f"{item.source}={item.candidate_total} "
                            f"{item.match_type} "
                            f"diff={item.difference} "
                            f"tip={item.tip_percentage}% "
                            f"{'OK' if item.accepted else 'NO'}"
                        )
                        for item in diagnostic.amount_diagnostics
                    ]
                )
                status = (
                    f"ACEPTADO ({diagnostic.match_result.match_type})"
                    if diagnostic.accepted and diagnostic.match_result
                    else f"DESCARTADO: {', '.join(diagnostic.rejection_reasons)}"
                )
                self.stdout.write(
                    f"- Consumo {consumo.id} | fecha={consumo.fecha} | monto={consumo.monto} | comercio={consumo.comercio}"
                )
                self.stdout.write(
                    f"  scores: merchant={diagnostic.merchant_score:.2f}, pdf_date={diagnostic.pdf_date_score:.2f}, "
                    f"fecha={diagnostic.date_distance}d/{diagnostic.max_date_distance}d"
                )
                self.stdout.write(f'  montos: {amount_summary}')
                self.stdout.write(f'  estado: {status}')
