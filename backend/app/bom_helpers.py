"""Shared BOM resolution for production and sales (kit) — no FastAPI router imports."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timezone

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from . import models


def _as_of_point_for_lookup(as_of: date | None) -> datetime:
    if as_of is None:
        return datetime.now(timezone.utc)
    return datetime.combine(as_of, time(12, 0, 0), tzinfo=timezone.utc)


def _bom_effective_predicate(as_of_point: datetime):
    return and_(
        or_(
            models.BOMMaster.effective_from.is_(None),
            models.BOMMaster.effective_from <= as_of_point,
        ),
        or_(
            models.BOMMaster.effective_to.is_(None),
            models.BOMMaster.effective_to >= as_of_point,
        ),
    )


def get_latest_bom_for_product(
    db: Session, *, company_id: int, product_id: int, as_of: date | None = None
) -> models.BOMMaster | None:
    point = _as_of_point_for_lookup(as_of)
    return (
        db.query(models.BOMMaster)
        .options(joinedload(models.BOMMaster.items))
        .filter(
            models.BOMMaster.company_id == company_id,
            models.BOMMaster.product_id == product_id,
            _bom_effective_predicate(point),
        )
        .order_by(models.BOMMaster.version.desc(), models.BOMMaster.id.desc())
        .first()
    )


def explode_flat_kit_components(*, bom: models.BOMMaster, kit_qty: float) -> dict[int, float]:
    """BOM lines × kit_qty with wastage (flat only; no sub-assembly explosion on sale)."""
    out: dict[int, float] = defaultdict(float)
    for row in bom.items:
        req = float(kit_qty) * float(row.quantity or 0)
        req *= 1.0 + (float(row.wastage_percent or 0) / 100.0)
        out[int(row.component_product_id)] += req
    return dict(out)
