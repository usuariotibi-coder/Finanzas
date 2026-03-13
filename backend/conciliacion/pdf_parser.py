from __future__ import annotations

import re
import unicodedata
from datetime import date
from typing import Any


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def _normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_for_search(value: str) -> str:
    return _strip_accents(_normalize_spaces(value)).upper()


def _normalize_pdf_date(raw_value: str) -> str | None:
    value = str(raw_value or "").strip()
    if not value:
        return None

    for separator in ('/', '-'):
        parts = value.split(separator)
        if len(parts) != 3:
            continue
        left, middle, right = parts
        if len(left) == 4:
            year, month, day = left, middle, right
        else:
            day, month, year = left, middle, right
        try:
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            continue
    return None


def _extract_date_hints(text: str) -> list[str]:
    hints: list[str] = []
    patterns = [
        r"\b\d{2}/\d{2}/\d{4}\b",
        r"\b\d{2}-\d{2}-\d{4}\b",
        r"\b\d{4}-\d{2}-\d{2}\b",
    ]
    for pattern in patterns:
        for match in re.findall(pattern, text):
            normalized = _normalize_pdf_date(match)
            if normalized and normalized not in hints:
                hints.append(normalized)
    return hints[:12]


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


def _parse_amount(raw_value: str) -> float | None:
    normalized = _normalize_number(raw_value)
    if not normalized:
        return None
    try:
        return round(float(normalized), 2)
    except ValueError:
        return None


def _find_uuid(text: str) -> str | None:
    match = re.search(r"\b[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\b", text, flags=re.IGNORECASE)
    return match.group(0).upper() if match else None


def _find_rfc(text: str) -> str | None:
    labeled_patterns = [
        r"RFC(?:\s+EMISOR)?\s*[:#-]?\s*([A-Z&N]{3,4}\d{6}[A-Z0-9]{3})",
        r"R\.?F\.?C\.?\s*[:#-]?\s*([A-Z&N]{3,4}\d{6}[A-Z0-9]{3})",
    ]
    for pattern in labeled_patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return match.group(1).upper()

    generic = re.search(r"\b([A-Z&N]{3,4}\d{6}[A-Z0-9]{3})\b", text, flags=re.IGNORECASE)
    return generic.group(1).upper() if generic else None


def _find_total(text: str) -> float | None:
    patterns = [
        r"(?:GRAN\s+TOTAL|TOTAL\s+GENERAL|IMPORTE\s+TOTAL|MONTO\s+TOTAL|TOTAL\s+A\s+PAGAR|TOTAL(?:\s+MXN|\s+MN|\s+USD)?)\s*[:$]?\s*([0-9][0-9,\.]+)",
        r"TOTAL\s*[:$]\s*([0-9][0-9,\.]+)",
    ]
    matches: list[float] = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            amount = _parse_amount(match.group(1))
            if amount is not None:
                matches.append(amount)
    return max(matches) if matches else None


def _looks_like_uuid(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}", value, flags=re.IGNORECASE))


def _find_folio(text: str, uuid: str | None) -> str | None:
    patterns = [
        r"SERIE\s+Y\s+FOLIO\s*[:#-]?\s*([A-Z0-9-]{3,40})",
        r"FOLIO(?:\s+INTERNO|\s+FACTURA)?\s*[:#-]?\s*([A-Z0-9-]{3,40})",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            candidate = match.group(1).strip().upper()
            if uuid and candidate == uuid.upper():
                continue
            if _looks_like_uuid(candidate):
                continue
            return candidate
    return None


def _find_razon_social(lines: list[str], text: str, rfc: str | None) -> str | None:
    def is_valid_business_name(value: str) -> bool:
        candidate = _normalize_spaces(value).strip(" :-")
        if len(candidate) < 4:
            return False
        if re.fullmatch(r"\d{8,}", candidate):
            return False
        search_candidate = _normalize_for_search(candidate)
        if search_candidate in {
            "EMISOR",
            "RAZON SOCIAL",
            "RAZON SOCIAL EMISOR",
            "NOMBRE O RAZON SOCIAL",
            "NOMBRE DEL EMISOR",
        }:
            return False
        if "CERTIFICADO" in search_candidate or "SELLO" in search_candidate:
            return False
        return True

    line_patterns = (
        "RAZON SOCIAL",
        "NOMBRE O RAZON SOCIAL",
        "RAZON SOCIAL EMISOR",
        "NOMBRE DEL EMISOR",
        "EMISOR",
    )
    for index, line in enumerate(lines):
        search_line = _normalize_for_search(line)
        for pattern in line_patterns:
            if pattern not in search_line:
                continue
            inline_match = re.search(rf"{pattern}\s*[:#-]?\s*(.+)$", search_line)
            if inline_match:
                candidate = inline_match.group(1).strip(" :-")
                if candidate and "RFC" not in candidate and is_valid_business_name(candidate):
                    return candidate
            if index + 1 < len(lines):
                next_line = _normalize_spaces(lines[index + 1])
                next_search = _normalize_for_search(next_line)
                if next_line and "RFC" not in next_search and is_valid_business_name(next_line):
                    return next_line

    if rfc:
        for index, line in enumerate(lines):
            if rfc.upper() not in _normalize_for_search(line):
                continue
            for back_index in range(max(0, index - 2), index):
                candidate = _normalize_spaces(lines[back_index])
                candidate_search = _normalize_for_search(candidate)
                if (
                    is_valid_business_name(candidate)
                    and "UUID" not in candidate_search
                    and "FOLIO" not in candidate_search
                    and "RFC" not in candidate_search
                ):
                    return candidate

    inline_patterns = [
        r"RAZON\s+SOCIAL\s*[:#-]?\s*([A-Z0-9&.,' -]{4,120})",
        r"NOMBRE\s+O\s+RAZON\s+SOCIAL\s*[:#-]?\s*([A-Z0-9&.,' -]{4,120})",
    ]
    for pattern in inline_patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            candidate = _normalize_spaces(match.group(1)).strip(" :-")
            if candidate and "RFC" not in _normalize_for_search(candidate) and is_valid_business_name(candidate):
                return candidate
    return None


def extract_pdf_structured_hints(raw_text: str) -> dict[str, Any]:
    lines = [_normalize_spaces(line) for line in str(raw_text or "").splitlines()]
    lines = [line for line in lines if line]
    normalized_text = _normalize_spaces(raw_text)
    searchable_text = _normalize_for_search(raw_text)
    uuid = _find_uuid(searchable_text)
    rfc = _find_rfc(searchable_text)
    razon_social = _find_razon_social(lines, searchable_text, rfc)
    total = _find_total(searchable_text)
    folio = _find_folio(searchable_text, uuid)

    hints: dict[str, Any] = {}
    if total is not None:
        hints["pdfDetectedTotal"] = total
    if rfc:
        hints["pdfDetectedRfc"] = rfc
    if folio:
        hints["pdfDetectedFolio"] = folio
    if uuid:
        hints["pdfDetectedUuid"] = uuid
    if razon_social:
        hints["pdfDetectedRazonSocial"] = razon_social
    if normalized_text:
        hints["pdfPreviewText"] = normalized_text[:4000]
        hints["pdfDateHints"] = _extract_date_hints(normalized_text)
    return hints


def extract_pdf_hints(file_obj: Any) -> dict[str, Any]:
    if not file_obj:
        return {}

    try:
        from pypdf import PdfReader
    except Exception:
        return {}

    try:
        reader = PdfReader(file_obj)
        text_chunks: list[str] = []
        for page in reader.pages[:3]:
            extracted = page.extract_text() or ""
            if extracted.strip():
                text_chunks.append(extracted)
        raw_text = " ".join(text_chunks)
    except Exception:
        return {}
    finally:
        try:
            file_obj.seek(0)
        except Exception:
            pass

    normalized_text = re.sub(r"\s+", " ", raw_text).strip()
    if not normalized_text:
        return {}
    return extract_pdf_structured_hints(raw_text)
