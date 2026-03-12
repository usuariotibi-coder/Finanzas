from django.core.management.base import BaseCommand

from conciliacion.models import Factura
from conciliacion.pdf_parser import extract_pdf_hints


class Command(BaseCommand):
    help = 'Extrae texto y fechas de PDFs ya cargados en Factura y los guarda en validacion_cfdi.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Reprocesa facturas aunque ya tengan metadata de PDF.',
        )

    def handle(self, *args, **options):
        force = bool(options.get('force'))
        updated = 0
        skipped = 0

        queryset = Factura.objects.exclude(archivo_pdf='').exclude(archivo_pdf__isnull=True)
        for factura in queryset.iterator():
            current_validation = dict(factura.validacion_cfdi or {})
            if not force and current_validation.get('pdfPreviewText'):
                skipped += 1
                continue

            try:
                with factura.archivo_pdf.open('rb') as pdf_file:
                    pdf_hints = extract_pdf_hints(pdf_file)
            except Exception:
                skipped += 1
                continue

            if not pdf_hints:
                skipped += 1
                continue

            current_validation.update(pdf_hints)
            factura.validacion_cfdi = current_validation
            factura.save(update_fields=['validacion_cfdi'])
            updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Backfill completado. Actualizadas: {updated}. Omitidas: {skipped}.'
            )
        )
