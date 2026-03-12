from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from django.db.models import Q, QuerySet

from .models import Consumo, Factura

AMOUNT_MATCH_EPSILON = Decimal("0.01")
MAX_TIP_RATIO = Decimal("0.30")
MERCHANT_STOPWORDS = {
    "sa",
    "de",
    "cv",
    "sapi",
    "the",
    "and",
    "for",
    "los",
    "las",
    "del",
    "por",
    "con",
    "para",
    "restaurant",
    "restaurante",
    "hotel",
    "mexico",
    "mx",
    "ticket",
    "factura",
}


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def normalize_merchant_text(value: str) -> str:
    cleaned = _strip_accents(value).lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def get_merchant_tokens(value: str) -> list[str]:
    return [
        token
        for token in normalize_merchant_text(value).split()
        if len(token) >= 3 and token not in MERCHANT_STOPWORDS
    ]


def get_merchant_compact(value: str) -> str:
    return "".join(get_merchant_tokens(value))


def get_merchant_similarity(left: str, right: str) -> float:
    left_compact = get_merchant_compact(left)
    right_compact = get_merchant_compact(right)
    if not left_compact or not right_compact:
        return 0.0
    if left_compact == right_compact:
        return 1.0
    if left_compact in right_compact or right_compact in left_compact:
        return 0.92

    left_tokens = sorted(set(get_merchant_tokens(left)))
    right_tokens = sorted(set(get_merchant_tokens(right)))
    if not left_tokens or not right_tokens:
        return 0.0

    shared = len([token for token in left_tokens if token in right_tokens])
    if shared == 0:
        return 0.0

    overlap = shared / min(len(left_tokens), len(right_tokens))
    coverage = shared / max(len(left_tokens), len(right_tokens))
    return round((overlap * 0.7) + (coverage * 0.3), 4)


def coerce_date(value):
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise ValueError("Invalid date value")


def diff_days(left_date, right_date) -> int:
    return abs((coerce_date(left_date) - coerce_date(right_date)).days)


def get_pdf_date_score(factura: Factura, consumo: Consumo) -> float:
    validacion = factura.validacion_cfdi or {}
    date_hints = validacion.get("pdfDateHints")
    if not isinstance(date_hints, list) or not consumo.fecha:
        return 0.0

    target_date = coerce_date(consumo.fecha).isoformat()
    normalized_hints = [str(hint).strip() for hint in date_hints if str(hint).strip()]
    if target_date in normalized_hints:
        return 1.0

    distances = []
    for hint in normalized_hints:
        try:
            distances.append(diff_days(consumo.fecha, date.fromisoformat(hint)))
        except ValueError:
            continue

    if not distances:
        return 0.0

    best_distance = min(distances)
    if best_distance <= 1:
        return 0.85
    if best_distance <= 3:
        return 0.65
    return 0.0


def get_factura_merchant_texts(factura: Factura) -> list[str]:
    validacion = factura.validacion_cfdi or {}
    values = [
        factura.razon_social,
        validacion.get("pdfDetectedRazonSocial", ""),
        validacion.get("pdfPreviewText", ""),
    ]
    for concepto in factura.conceptos or []:
        if isinstance(concepto, dict):
            values.append(str(concepto.get("descripcion") or "").strip())
    return list({value.strip() for value in values if str(value).strip()})


def get_factura_total_candidates(factura: Factura) -> list[Decimal]:
    validacion = factura.validacion_cfdi or {}
    candidates = [Decimal(factura.total)]
    pdf_total = validacion.get("pdfDetectedTotal")
    if pdf_total not in (None, ""):
        try:
            decimal_total = Decimal(str(pdf_total))
            if decimal_total not in candidates:
                candidates.append(decimal_total)
        except Exception:
            pass
    return candidates


def get_merchant_score(factura: Factura, consumo: Consumo) -> float:
    row_texts = [consumo.comercio, f"{consumo.comercio} {consumo.concepto}".strip()]
    factura_texts = get_factura_merchant_texts(factura)
    best_score = 0.0
    for row_text in row_texts:
        for factura_text in factura_texts:
            best_score = max(best_score, get_merchant_similarity(row_text, factura_text))
            if best_score >= 0.999:
                return best_score
    return best_score


@dataclass
class ConsumoMatchResult:
    consumo: Consumo
    propina_detectada: Decimal
    propina_porcentaje: Decimal
    match_type: str
    date_distance: int
    merchant_score: float
    pdf_date_score: float


def get_consumo_match_candidate(factura: Factura, consumo: Consumo) -> ConsumoMatchResult | None:
    date_distance = diff_days(factura.fecha, consumo.fecha)
    merchant_score = get_merchant_score(factura, consumo)
    pdf_date_score = get_pdf_date_score(factura, consumo)

    exact_amount_candidates = []
    tip_amount_candidates = []
    for candidate_total in get_factura_total_candidates(factura):
        difference = Decimal(consumo.monto) - candidate_total
        if abs(difference) <= AMOUNT_MATCH_EPSILON:
            exact_amount_candidates.append(candidate_total)
            continue
        if difference < 0 or candidate_total <= 0:
            continue
        tip_ratio = difference / candidate_total
        if tip_ratio > MAX_TIP_RATIO:
            continue
        tip_amount_candidates.append((difference.quantize(Decimal("0.01")), candidate_total))

    has_exact_amount = len(exact_amount_candidates) > 0

    if has_exact_amount and merchant_score >= 0.55:
        max_date_distance = 30
    elif pdf_date_score >= 0.85:
        max_date_distance = 15
    elif pdf_date_score >= 0.65 or merchant_score >= 0.6:
        max_date_distance = 10
    elif merchant_score >= 0.35:
        max_date_distance = 7
    else:
        max_date_distance = 3

    if date_distance > max_date_distance:
        return None

    amount_matches: list[tuple[Decimal, str, Decimal]] = []
    for candidate_total in exact_amount_candidates:
        amount_matches.append((Decimal("0.00"), "exacto", candidate_total))
    for difference, candidate_total in tip_amount_candidates:
        amount_matches.append((difference, "propina", candidate_total))

    if not amount_matches:
        return None

    difference, match_type, matched_total = sorted(
        amount_matches,
        key=lambda item: (0 if item[1] == "exacto" else 1, item[0])
    )[0]

    if match_type == "exacto":
        return ConsumoMatchResult(
            consumo=consumo,
            propina_detectada=Decimal("0.00"),
            propina_porcentaje=Decimal("0.00"),
            match_type="exacto",
            date_distance=date_distance,
            merchant_score=merchant_score,
            pdf_date_score=pdf_date_score,
        )

    tip_ratio = difference / matched_total if matched_total > 0 else Decimal("0")

    return ConsumoMatchResult(
        consumo=consumo,
        propina_detectada=difference,
        propina_porcentaje=(tip_ratio * Decimal("100")).quantize(Decimal("0.01")),
        match_type="propina",
        date_distance=date_distance,
        merchant_score=merchant_score,
        pdf_date_score=pdf_date_score,
    )


def get_match_tuple(match: ConsumoMatchResult) -> tuple[Any, ...]:
    return (
        0 if match.match_type == "exacto" else 1,
        100 - round(match.pdf_date_score * 100),
        100 - round(match.merchant_score * 100),
        match.date_distance,
        float(match.propina_porcentaje),
        float(match.propina_detectada),
    )


def get_candidate_consumos(factura: Factura) -> QuerySet[Consumo]:
    queryset = Consumo.objects.select_related("factura").filter(user=factura.user)
    if factura.viatico_id:
        same_viatico = queryset.filter(viatico_id=factura.viatico_id)
        if same_viatico.exists():
            queryset = same_viatico

    return queryset.filter(
        Q(factura__isnull=True)
        | Q(factura=factura)
        | Q(matched=False)
    )


def find_matching_consumo_for_factura(factura: Factura) -> ConsumoMatchResult | None:
    candidates = [
        match
        for consumo in get_candidate_consumos(factura)
        for match in [get_consumo_match_candidate(factura, consumo)]
        if match is not None
    ]
    candidates.sort(key=get_match_tuple)
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1 and get_match_tuple(candidates[0]) != get_match_tuple(candidates[1]):
        return candidates[0]
    return None


def reconcile_factura_with_consumos(factura: Factura) -> Consumo | None:
    match = find_matching_consumo_for_factura(factura)
    linked_consumos = list(Consumo.objects.filter(factura=factura))

    if not match:
        for linked in linked_consumos:
            linked.factura = None
            linked.matched = False
            linked.propina_detectada = None
            linked.propina_porcentaje = None
            linked.save(update_fields=["factura", "matched", "propina_detectada", "propina_porcentaje"])
        if factura.match_consumo:
            factura.match_consumo = False
            factura.save(update_fields=["match_consumo"])
        return None

    matched_consumo = match.consumo
    for linked in linked_consumos:
        if linked.pk == matched_consumo.pk:
            continue
        linked.factura = None
        linked.matched = False
        linked.propina_detectada = None
        linked.propina_porcentaje = None
        linked.save(update_fields=["factura", "matched", "propina_detectada", "propina_porcentaje"])

    if matched_consumo.factura_id and matched_consumo.factura_id != factura.id:
        previous_factura = matched_consumo.factura
        if previous_factura:
            previous_factura.match_consumo = False
            previous_factura.save(update_fields=["match_consumo"])

    matched_consumo.factura = factura
    matched_consumo.matched = True
    matched_consumo.propina_detectada = match.propina_detectada
    matched_consumo.propina_porcentaje = match.propina_porcentaje
    if factura.archivo_pdf:
        matched_consumo.factura_pdf_name = factura.archivo_pdf.name
    if factura.archivo_xml:
        matched_consumo.factura_xml_name = factura.archivo_xml.name
    matched_consumo.save(
        update_fields=[
            "factura",
            "matched",
            "propina_detectada",
            "propina_porcentaje",
            "factura_pdf_name",
            "factura_xml_name",
        ]
    )

    if not factura.match_consumo:
        factura.match_consumo = True
        factura.save(update_fields=["match_consumo"])

    return matched_consumo
