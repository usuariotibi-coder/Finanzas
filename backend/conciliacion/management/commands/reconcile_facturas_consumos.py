from django.core.management.base import BaseCommand

from conciliacion.matching import reconcile_factura_with_consumos
from conciliacion.models import Consumo, Factura


class Command(BaseCommand):
    help = 'Reprocesa la relacion entre facturas y consumos usando XML y pistas extraidas del PDF.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--only-unmatched',
            action='store_true',
            help='Solo reprocesa facturas que actualmente no tienen match de consumo.',
        )
        parser.add_argument(
            '--reset-consumos',
            action='store_true',
            help='Limpia primero los matches existentes en consumos para reconstruirlos solo desde facturas.',
        )

    def handle(self, *args, **options):
        queryset = Factura.objects.select_related('user', 'viatico').order_by('created_at')
        if options['only_unmatched']:
            queryset = queryset.filter(match_consumo=False)
        facturas = list(queryset)

        if options['reset_consumos']:
            factura_ids = [factura.id for factura in facturas]
            user_ids = sorted({factura.user_id for factura in facturas})
            if factura_ids or user_ids:
                Consumo.objects.filter(user_id__in=user_ids).update(
                    factura=None,
                    matched=False,
                    propina_detectada=None,
                    propina_porcentaje=None,
                )
                Factura.objects.filter(id__in=factura_ids).update(match_consumo=False)
                for factura in facturas:
                    factura.match_consumo = False

        matched = 0
        unmatched = 0
        for factura in facturas:
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
