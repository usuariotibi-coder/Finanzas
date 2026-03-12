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
TIP_MATCH_MIN_MERCHANT_SCORE = 0.30
MERCHANT_FALLBACK_MIN_SCORE = 0.75
MERCHANT_FALLBACK_MAX_DATE_DISTANCE = 10
MERCHANT_FALLBACK_MAX_AMOUNT_RATIO = Decimal("0.20")
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
        # Soft matching for abbreviated merchants: "farm guad" ~= "farmacia guadalajara"
        used_right: set[str] = set()
        for left_token in left_tokens:
            for right_token in right_tokens:
                if right_token in used_right:
                    continue
                if len(left_token) < 4 or len(right_token) < 4:
                    continue
                if left_token.startswith(right_token) or right_token.startswith(left_token):
                    shared += 1
                    used_right.add(right_token)
                    break
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
    values = [
        factura.razon_social,
    ]
    for concepto in factura.conceptos or []:
        if isinstance(concepto, dict):
            values.append(str(concepto.get("descripcion") or "").strip())
    return list({value.strip() for value in values if str(value).strip()})


def get_factura_pdf_merchant_texts(factura: Factura) -> list[str]:
    validacion = factura.validacion_cfdi or {}
    values = [
        validacion.get("pdfDetectedRazonSocial", ""),
        validacion.get("pdfPreviewText", ""),
    ]
    return list({value.strip() for value in values if str(value).strip()})


def get_xml_total_candidate(factura: Factura) -> Decimal:
    return Decimal(factura.total)


def get_pdf_total_candidate(factura: Factura) -> Decimal | None:
    validacion = factura.validacion_cfdi or {}
    pdf_total = validacion.get("pdfDetectedTotal")
    if pdf_total in (None, ""):
        return None
    try:
        return Decimal(str(pdf_total))
    except Exception:
        return None


def _get_best_merchant_score(row_texts: list[str], factura_texts: list[str]) -> float:
    best_score = 0.0
    for row_text in row_texts:
        for factura_text in factura_texts:
            best_score = max(best_score, get_merchant_similarity(row_text, factura_text))
            if best_score >= 0.999:
                return best_score
    return best_score


def get_merchant_score(factura: Factura, consumo: Consumo) -> float:
    row_texts = [consumo.comercio, f"{consumo.comercio} {consumo.concepto}".strip()]
    xml_score = _get_best_merchant_score(row_texts, get_factura_merchant_texts(factura))
    if xml_score >= 0.35:
        return xml_score
    pdf_score = _get_best_merchant_score(row_texts, get_factura_pdf_merchant_texts(factura))
    return max(xml_score, pdf_score)


@dataclass
class ConsumoMatchResult:
    consumo: Consumo
    propina_detectada: Decimal
    propina_porcentaje: Decimal
    match_type: str
    date_distance: int
    merchant_score: float
    pdf_date_score: float


@dataclass
class AmountMatchDiagnostic:
    source: str
    candidate_total: Decimal
    accepted: bool
    match_type: str
    difference: Decimal
    tip_percentage: Decimal


@dataclass
class ConsumoMatchDiagnostic:
    consumo: Consumo
    date_distance: int
    merchant_score: float
    pdf_date_score: float
    max_date_distance: int
    amount_diagnostics: list[AmountMatchDiagnostic]
    accepted: bool
    rejection_reasons: list[str]
    match_result: ConsumoMatchResult | None


def _build_amount_diagnostics(factura: Factura, consumo: Consumo) -> list[AmountMatchDiagnostic]:
    diagnostics: list[AmountMatchDiagnostic] = []
    xml_total = get_xml_total_candidate(factura)
    amount_sources: list[tuple[str, Decimal]] = [("xml_total", xml_total)]
    xml_difference = (Decimal(consumo.monto) - xml_total).quantize(Decimal("0.01"))
    xml_exact = abs(xml_difference) <= AMOUNT_MATCH_EPSILON
    xml_tip = xml_difference >= 0 and xml_total > 0 and (xml_difference / xml_total) <= MAX_TIP_RATIO
    pdf_total = get_pdf_total_candidate(factura)
    if not (xml_exact or xml_tip) and pdf_total is not None and pdf_total != xml_total:
        amount_sources.append(("pdf_total", pdf_total))

    for source, candidate_total in amount_sources:
        difference = (Decimal(consumo.monto) - candidate_total).quantize(Decimal("0.01"))
        if abs(difference) <= AMOUNT_MATCH_EPSILON:
            diagnostics.append(
                AmountMatchDiagnostic(
                    source=source,
                    candidate_total=candidate_total,
                    accepted=True,
                    match_type="exacto",
                    difference=Decimal("0.00"),
                    tip_percentage=Decimal("0.00"),
                )
            )
            continue
        if difference < 0 or candidate_total <= 0:
            diagnostics.append(
                AmountMatchDiagnostic(
                    source=source,
                    candidate_total=candidate_total,
                    accepted=False,
                    match_type="descartado",
                    difference=difference,
                    tip_percentage=Decimal("0.00"),
                )
            )
            continue

        tip_ratio = difference / candidate_total
        diagnostics.append(
            AmountMatchDiagnostic(
                source=source,
                candidate_total=candidate_total,
                accepted=tip_ratio <= MAX_TIP_RATIO,
                match_type="propina" if tip_ratio <= MAX_TIP_RATIO else "descartado",
                difference=difference,
                tip_percentage=(tip_ratio * Decimal("100")).quantize(Decimal("0.01")),
            )
        )
    return diagnostics


def _get_max_date_distance(has_exact_amount: bool, merchant_score: float, pdf_date_score: float) -> int:
    return 9999


def _has_tip_context(merchant_score: float, pdf_date_score: float) -> bool:
    return merchant_score >= TIP_MATCH_MIN_MERCHANT_SCORE or (
        merchant_score >= 0.2 and pdf_date_score >= 0.85
    )


def diagnose_consumo_candidate(factura: Factura, consumo: Consumo) -> ConsumoMatchDiagnostic:
    date_distance = diff_days(factura.fecha, consumo.fecha)
    merchant_score = get_merchant_score(factura, consumo)
    pdf_date_score = get_pdf_date_score(factura, consumo)
    amount_diagnostics = _build_amount_diagnostics(factura, consumo)
    has_exact_amount = any(item.accepted and item.match_type == "exacto" for item in amount_diagnostics)
    max_date_distance = _get_max_date_distance(has_exact_amount, merchant_score, pdf_date_score)
    rejection_reasons: list[str] = []

    if not any(item.accepted for item in amount_diagnostics):
        rejection_reasons.append("monto no coincide con total XML/PDF dentro de tolerancia")
    if merchant_score < 0.35 and pdf_date_score < 0.65:
        rejection_reasons.append(
            f"comercio/de fecha debiles (merchant={merchant_score:.2f}, pdf_date={pdf_date_score:.2f})"
        )

    accepted_amounts = []
    for item in amount_diagnostics:
        if not item.accepted or item.match_type not in ("exacto", "propina"):
            continue
        if item.match_type == "propina" and not _has_tip_context(merchant_score, pdf_date_score):
            continue
        accepted_amounts.append(item)
    accepted = len(accepted_amounts) > 0
    match_result: ConsumoMatchResult | None = None
    if accepted:
        rejection_reasons = []
        best_amount = sorted(
            accepted_amounts,
            key=lambda item: (0 if item.match_type == "exacto" else 1, item.difference)
        )[0]
        match_result = ConsumoMatchResult(
            consumo=consumo,
            propina_detectada=Decimal("0.00") if best_amount.match_type == "exacto" else best_amount.difference,
            propina_porcentaje=best_amount.tip_percentage,
            match_type=best_amount.match_type,
            date_distance=date_distance,
            merchant_score=merchant_score,
            pdf_date_score=pdf_date_score,
        )
    else:
        xml_total = get_xml_total_candidate(factura)
        pdf_total = get_pdf_total_candidate(factura)
        fallback_total = pdf_total if pdf_total is not None and pdf_total > 0 else xml_total
        fallback_diff = abs((Decimal(consumo.monto) - fallback_total).quantize(Decimal("0.01")))
        fallback_ratio = (
            (fallback_diff / fallback_total).quantize(Decimal("0.0001"))
            if fallback_total > 0
            else Decimal("9999")
        )
        fallback_date_ok = pdf_date_score >= 0.65 or date_distance <= MERCHANT_FALLBACK_MAX_DATE_DISTANCE
        if (
            merchant_score >= MERCHANT_FALLBACK_MIN_SCORE
            and fallback_date_ok
            and fallback_ratio <= MERCHANT_FALLBACK_MAX_AMOUNT_RATIO
        ):
            accepted = True
            rejection_reasons = []
            match_result = ConsumoMatchResult(
                consumo=consumo,
                propina_detectada=Decimal("0.00"),
                propina_porcentaje=Decimal("0.00"),
                match_type="comercio",
                date_distance=date_distance,
                merchant_score=merchant_score,
                pdf_date_score=pdf_date_score,
            )

    return ConsumoMatchDiagnostic(
        consumo=consumo,
        date_distance=date_distance,
        merchant_score=merchant_score,
        pdf_date_score=pdf_date_score,
        max_date_distance=max_date_distance,
        amount_diagnostics=amount_diagnostics,
        accepted=accepted,
        rejection_reasons=rejection_reasons,
        match_result=match_result,
    )


def get_consumo_match_candidate(factura: Factura, consumo: Consumo) -> ConsumoMatchResult | None:
    diagnostic = diagnose_consumo_candidate(factura, consumo)
    if not diagnostic.accepted or not diagnostic.match_result:
        return None

    return diagnostic.match_result


def get_match_tuple(match: ConsumoMatchResult) -> tuple[Any, ...]:
    return (
        0 if match.match_type == "exacto" else 1 if match.match_type == "propina" else 2,
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


def diagnose_factura_candidates(factura: Factura, limit: int = 5) -> list[ConsumoMatchDiagnostic]:
    diagnostics = [
        diagnose_consumo_candidate(factura, consumo)
        for consumo in get_candidate_consumos(factura)
    ]
    diagnostics.sort(
        key=lambda item: (
            0 if item.accepted else 1,
            0 if item.match_result and item.match_result.match_type == "exacto" else 1,
            100 - round(item.pdf_date_score * 100),
            100 - round(item.merchant_score * 100),
            item.date_distance,
        )
    )
    return diagnostics[:limit]


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
