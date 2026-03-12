from django.core.management.base import BaseCommand

from conciliacion.matching import reconcile_factura_with_consumos
from conciliacion.models import Factura


class Command(BaseCommand):
    help = 'Reprocesa la relacion entre facturas y consumos usando XML y pistas extraidas del PDF.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--only-unmatched',
            action='store_true',
            help='Solo reprocesa facturas que actualmente no tienen match de consumo.',
        )

    def handle(self, *args, **options):
        queryset = Factura.objects.select_related('user', 'viatico').order_by('created_at')
        if options['only_unmatched']:
            queryset = queryset.filter(match_consumo=False)

        matched = 0
        unmatched = 0
        for factura in queryset.iterator():
            consumo = reconcile_factura_with_consumos(factura)
            if consumo:
                matched += 1
            else:
                unmatched += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Reproceso completado. Facturas conciliadas: {matched}. Sin match: {unmatched}.'
            )
        )
