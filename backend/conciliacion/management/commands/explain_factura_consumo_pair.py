from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from conciliacion.matching import diagnose_consumo_candidate, get_candidate_consumos
from conciliacion.models import Consumo, Factura


class Command(BaseCommand):
    help = "Explica por que un consumo especifico entra o no entra como candidato para una factura."

    def add_arguments(self, parser):
        parser.add_argument("--factura", type=int, required=True, help="ID de la factura")
        parser.add_argument("--consumo", type=int, required=True, help="ID del consumo")

    def handle(self, *args, **options):
        factura_id = options["factura"]
        consumo_id = options["consumo"]

        try:
            factura = Factura.objects.select_related("user").get(id=factura_id)
        except Factura.DoesNotExist as exc:
            raise CommandError(f"Factura {factura_id} no existe.") from exc

        try:
            consumo = Consumo.objects.select_related("user", "factura").get(id=consumo_id)
        except Consumo.DoesNotExist as exc:
            raise CommandError(f"Consumo {consumo_id} no existe.") from exc

        self.stdout.write(
            f"Factura {factura.id} | usuario={factura.user.full_name} | fecha={factura.fecha} | total={factura.total}"
        )
        self.stdout.write(
            f"Consumo {consumo.id} | usuario={consumo.user.full_name} | fecha={consumo.fecha} | monto={consumo.monto} | comercio={consumo.comercio}"
        )
        self.stdout.write(
            f"Estado consumo | factura_id={consumo.factura_id} | matched={consumo.matched} | viatico_id={consumo.viatico_id}"
        )
        self.stdout.write(
            f"Estado factura | match_consumo={factura.match_consumo} | viatico_id={factura.viatico_id}"
        )

        candidate_queryset = get_candidate_consumos(factura)
        is_candidate = candidate_queryset.filter(id=consumo.id).exists()
        self.stdout.write(f"En queryset candidato: {'si' if is_candidate else 'no'}")

        reasons: list[str] = []
        if consumo.user_id != factura.user_id:
            reasons.append("usuario distinto")
        if factura.viatico_id:
            same_viatico_exists = Consumo.objects.filter(user=factura.user, viatico_id=factura.viatico_id).exists()
            if same_viatico_exists and consumo.viatico_id != factura.viatico_id:
                reasons.append("la factura se filtro a consumos del mismo viatico")
        if not (
            consumo.factura_id is None
            or consumo.factura_id == factura.id
            or not consumo.matched
        ):
            reasons.append("ya esta ligado a otra factura y sigue marcado como matched")

        if reasons:
            self.stdout.write("Motivos de exclusion previos al match:")
            for reason in reasons:
                self.stdout.write(f"- {reason}")

        diagnostic = diagnose_consumo_candidate(factura, consumo)
        self.stdout.write(
            f"Scores | merchant={diagnostic.merchant_score:.2f} | pdf_date={diagnostic.pdf_date_score:.2f} | distancia={diagnostic.date_distance}d"
        )
        self.stdout.write("Montos evaluados:")
        for item in diagnostic.amount_diagnostics:
            self.stdout.write(
                f"- {item.source}: total={item.candidate_total} diff={item.difference} tip={item.tip_percentage}% accepted={item.accepted} tipo={item.match_type}"
            )

        if diagnostic.accepted and diagnostic.match_result:
            self.stdout.write(
                f"Resultado: ACEPTADO ({diagnostic.match_result.match_type})"
            )
        else:
            self.stdout.write(
                "Resultado: DESCARTADO"
            )
            for reason in diagnostic.rejection_reasons:
                self.stdout.write(f"- {reason}")
