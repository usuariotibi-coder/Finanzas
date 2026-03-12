from __future__ import annotations

import re
from datetime import date
from typing import Any


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

    return {
        "pdfPreviewText": normalized_text[:4000],
        "pdfDateHints": _extract_date_hints(normalized_text),
    }
