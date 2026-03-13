from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from xml.etree import ElementTree as ET


def _normalize_number(raw_value: str) -> str:
    value = str(raw_value or "").strip().replace("$", "").replace(" ", "")
    if not value:
        return ""
    if "," in value and "." in value:
        if value.rfind(",") > value.rfind("."):
            return value.replace(".", "").replace(",", ".")
        return value.replace(",", "")
    if "," in value:
        if value.count(",") == 1 and len(value.split(",")[-1]) <= 2:
            return value.replace(",", ".")
        return value.replace(",", "")
    return value


def _to_decimal(raw_value: str | None) -> Decimal | None:
    if raw_value is None:
        return None
    normalized = _normalize_number(raw_value)
    if not normalized:
        return None
    try:
        return Decimal(normalized)
    except (InvalidOperation, ValueError):
        return None


def _find_attr_case_insensitive(element: ET.Element, attr_name: str) -> str | None:
    wanted = attr_name.lower()
    for key, value in element.attrib.items():
        if key.lower() == wanted:
            return value
    return None


def _find_first_node(root: ET.Element, tag_name: str) -> ET.Element | None:
    wanted = tag_name.lower()
    for element in root.iter():
        tag = str(element.tag).split("}")[-1].lower()
        if tag == wanted:
            return element
    return None


def _find_all_nodes(root: ET.Element, tag_name: str) -> list[ET.Element]:
    wanted = tag_name.lower()
    matches: list[ET.Element] = []
    for element in root.iter():
        tag = str(element.tag).split("}")[-1].lower()
        if tag == wanted:
            matches.append(element)
    return matches


def _decimal_to_float(value: Decimal | None, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value)


@dataclass
class CFDIParsedData:
    subtotal: Decimal | None = None
    iva: Decimal | None = None
    total: Decimal | None = None
    fecha: date | None = None
    folio: str | None = None
    uuid: str | None = None
    rfc: str | None = None
    razon_social: str | None = None
    forma_pago: str | None = None
    metodo_pago: str | None = None
    conceptos: list[dict[str, Any]] | None = None


def parse_cfdi_xml(file_obj: Any) -> CFDIParsedData:
    if not file_obj:
        return CFDIParsedData()

    try:
        raw_bytes = file_obj.read()
    except Exception:
        return CFDIParsedData()
    finally:
        try:
            file_obj.seek(0)
        except Exception:
            pass

    if not raw_bytes:
        return CFDIParsedData()

    try:
        root = ET.fromstring(raw_bytes)
    except ET.ParseError:
        return CFDIParsedData()

    comprobante = _find_first_node(root, "Comprobante") or root
    emisor = _find_first_node(root, "Emisor")
    timbre = _find_first_node(root, "TimbreFiscalDigital")
    impuestos = _find_first_node(comprobante, "Impuestos")

    subtotal = _to_decimal(
        _find_attr_case_insensitive(comprobante, "SubTotal")
        or _find_attr_case_insensitive(comprobante, "subtotal")
    )
    total = _to_decimal(
        _find_attr_case_insensitive(comprobante, "Total")
        or _find_attr_case_insensitive(comprobante, "total")
    )
    iva = _to_decimal(
        _find_attr_case_insensitive(impuestos, "TotalImpuestosTrasladados")
        if impuestos is not None
        else None
    )
    if iva is None and subtotal is not None and total is not None:
        difference = total - subtotal
        iva = difference if difference >= Decimal("0") else Decimal("0")

    fecha_raw = _find_attr_case_insensitive(comprobante, "Fecha") or ""
    parsed_date: date | None = None
    if fecha_raw:
        try:
            parsed_date = date.fromisoformat(fecha_raw[:10])
        except ValueError:
            parsed_date = None

    serie = (_find_attr_case_insensitive(comprobante, "Serie") or "").strip()
    folio_value = (_find_attr_case_insensitive(comprobante, "Folio") or "").strip()
    folio = f"{serie}{folio_value}".strip() or None
    conceptos: list[dict[str, Any]] = []
    for concepto in _find_all_nodes(comprobante, "Concepto"):
        descripcion = (_find_attr_case_insensitive(concepto, "Descripcion") or "").strip()
        if not descripcion:
            continue
        concepto_impuestos = _find_first_node(concepto, "Impuestos")
        concepto_traslados = _find_all_nodes(concepto_impuestos, "Traslado") if concepto_impuestos is not None else []
        impuesto_importe = sum(
            (
                _to_decimal(_find_attr_case_insensitive(traslado, "Importe"))
                or Decimal("0")
            )
            for traslado in concepto_traslados
        )
        conceptos.append(
            {
                "claveProdServ": (_find_attr_case_insensitive(concepto, "ClaveProdServ") or "").strip(),
                "descripcion": descripcion,
                "cantidad": _decimal_to_float(_to_decimal(_find_attr_case_insensitive(concepto, "Cantidad")), 0.0),
                "valorUnitario": _decimal_to_float(
                    _to_decimal(_find_attr_case_insensitive(concepto, "ValorUnitario")),
                    0.0,
                ),
                "importe": _decimal_to_float(_to_decimal(_find_attr_case_insensitive(concepto, "Importe")), 0.0),
                "impuestoImporte": _decimal_to_float(impuesto_importe, 0.0),
            }
        )

    return CFDIParsedData(
        subtotal=subtotal,
        iva=iva,
        total=total,
        fecha=parsed_date,
        folio=folio,
        uuid=(_find_attr_case_insensitive(timbre, "UUID") or "").strip() or None,
        rfc=(_find_attr_case_insensitive(emisor, "Rfc") or "").strip() or None,
        razon_social=(_find_attr_case_insensitive(emisor, "Nombre") or "").strip() or None,
        forma_pago=(_find_attr_case_insensitive(comprobante, "FormaPago") or "").strip() or None,
        metodo_pago=(_find_attr_case_insensitive(comprobante, "MetodoPago") or "").strip() or None,
        conceptos=conceptos,
    )
