from __future__ import annotations

import json
import logging
from typing import Any

import openai
from fastapi import HTTPException
from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from ..routers.companies import _get_or_create_company_settings

logger = logging.getLogger(__name__)


def _extract_json_block(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def extract_document_data_with_ai(
    *,
    db: Session,
    company_id: int,
    filename: str,
    content_type: str | None,
    document_text: str,
) -> dict[str, Any]:
    settings = _get_or_create_company_settings(db, company_id=company_id)
    provider = (settings.get("ai_provider") or "").strip().lower()
    api_key = settings.get("ai_api_key")
    model = settings.get("ai_model")

    if not provider or not api_key:
        raise HTTPException(
            status_code=400,
            detail="AI Assistant is not configured for this company. Please set AI Provider and API Key in Settings.",
        )

    system_prompt = (
        "Extract purchase/billing data from OCR text. "
        "Return STRICT JSON only with keys: "
        "document_type (PURCHASE or BILL), vendor_name, invoice_number, invoice_date (YYYY-MM-DD), "
        "items (array of {name, qty, price, tax_rate}), total_amount, tax, confidence_score."
    )
    user_prompt = (
        f"Filename: {filename}\n"
        f"Content-Type: {content_type or 'unknown'}\n\n"
        "OCR Text:\n"
        f"{document_text or ''}"
    )

    try:
        if provider == "openai":
            client = openai.OpenAI(api_key=api_key)
            resp = client.chat.completions.create(
                model=model or "gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=1200,
            )
            raw = (resp.choices[0].message.content or "").strip()
            return _extract_json_block(raw)

        if provider == "google":
            client = genai.Client(api_key=api_key)
            current_model = model or "gemini-2.5-flash"
            if current_model == "gemini-pro":
                current_model = "gemini-2.5-pro"

            response = client.models.generate_content(
                model=current_model,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.1,
                    max_output_tokens=1200,
                ),
                contents=user_prompt,
            )
            return _extract_json_block(response.text or "")

        raise HTTPException(status_code=400, detail=f"Unsupported AI provider: {provider}")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Document AI extraction failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to extract document data using AI.") from exc

