from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, Dict

from fastapi import HTTPException
from fastapi.responses import Response
from jinja2 import Environment, FileSystemLoader, select_autoescape

try:
    from weasyprint import HTML  # type: ignore
    _WEASYPRINT_AVAILABLE = True
except Exception:  # ImportError or OSError from missing native libs
    HTML = None  # type: ignore
    _WEASYPRINT_AVAILABLE = False


BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"

env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def render_pdf(template_name: str, context: Dict[str, Any], filename: str) -> Response:
    if not _WEASYPRINT_AVAILABLE:
        # Fail only when a PDF endpoint is called, not at app startup.
        raise HTTPException(
            status_code=500,
            detail="PDF generation is not available on this server. WeasyPrint or its system dependencies are missing.",
        )

    template = env.get_template(template_name)
    html_str = template.render(**context)
    pdf_bytes = HTML(string=html_str).write_pdf()
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
