from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models


@dataclass(frozen=True)
class StockProductSummary:
    product_id: int
    qty_on_hand: float
    value: float


@dataclass(frozen=True)
class StockLedgerRow:
    at: datetime
    ref_type: str
    ref_id: int | None
    qty_in: float
    qty_out: float
    qty_balance: float
    value_balance: float


class StockValuationService:
    def __init__(self, db: Session):
        self.db = db

    def get_tenant_settings(self, *, tenant_id: int) -> models.TenantSettings:
        settings = (
            self.db.query(models.TenantSettings)
            .filter(models.TenantSettings.tenant_id == tenant_id)
            .first()
        )
        if settings is not None:
            return settings

        tenant = self.db.query(models.Tenant).filter(models.Tenant.id == tenant_id).first()
        if tenant is None:
            raise HTTPException(status_code=404, detail="Tenant not found")

        settings = models.TenantSettings(
            tenant_id=tenant_id,
            inventory_valuation_method=getattr(tenant, "inventory_valuation_method", models.InventoryValuationMethod.FIFO)
            or models.InventoryValuationMethod.FIFO,
            allow_negative_stock=False,
        )
        self.db.add(settings)
        self.db.flush()
        return settings

    def get_inventory_valuation_method(self, *, tenant_id: int) -> models.InventoryValuationMethod:
        settings = self.get_tenant_settings(tenant_id=tenant_id)
        return settings.inventory_valuation_method or models.InventoryValuationMethod.FIFO

    def get_qty_on_hand_by_product(
        self,
        *,
        company_id: int,
        as_of: date | None = None,
        product_ids: list[int] | None = None,
        ignore_fixed_assets: bool = False,
    ) -> dict[int, float]:
        if as_of is None:
            as_of = date.today()

        Item = models.Item
        StockLedger = models.StockLedger

        q = self.db.query(Item.id, Item.opening_stock).filter(Item.company_id == company_id)
        if product_ids is not None:
            q = q.filter(Item.id.in_(product_ids))
        if ignore_fixed_assets:
            q = q.filter(Item.is_fixed_asset.isnot(True))
        items = q.all()
        opening_map = {int(r.id): float(r.opening_stock or 0) for r in items}
        if not opening_map:
            return {}

        movement_rows = (
            self.db.query(StockLedger.item_id, func.coalesce(func.sum(StockLedger.qty_delta), 0))
            .filter(
                StockLedger.company_id == company_id,
                StockLedger.item_id.in_(list(opening_map.keys())),
                StockLedger.reversed_at.is_(None),
                func.date(StockLedger.posted_at) <= as_of,
            )
            .group_by(StockLedger.item_id)
            .all()
        )
        movement_map = {int(item_id): float(qty_delta or 0) for item_id, qty_delta in movement_rows}

        return {pid: opening_map.get(pid, 0.0) + movement_map.get(pid, 0.0) for pid in opening_map.keys()}

    def get_valuation_by_product(
        self,
        *,
        company: models.Company,
        as_of: date | None = None,
        product_ids: list[int] | None = None,
        ignore_fixed_assets: bool = False,
    ) -> dict[int, StockProductSummary]:
        if as_of is None:
            as_of = date.today()

        tenant_id = int(company.tenant_id)
        method = self.get_inventory_valuation_method(tenant_id=tenant_id)

        # 1. Fetch Items (Opening Stock)
        Item = models.Item
        q_items = self.db.query(
            Item.id, 
            Item.opening_stock, 
            Item.opening_rate, 
            Item.opening_value,
            Item.default_purchase_rate,
            Item.default_sales_rate
        ).filter(Item.company_id == company.id)
        
        if product_ids is not None:
            q_items = q_items.filter(Item.id.in_(product_ids))
        
        if ignore_fixed_assets:
            q_items = q_items.filter(Item.is_fixed_asset.is_(False))
        
        items = q_items.all()
        # Initialize result map
        # We need a set of item IDs to filter ledger
        target_item_ids = {r.id for r in items}
        
        # 2. Prepare Opening Balances
        # FIFO layers: list[list[qty, cost]]
        fifo_layers_by_item: dict[int, list[list[float]]] = {}
        
        # Average Cost accumulators
        avg_cost_map: dict[int, tuple[float, float]] = {} # (qty, value)

        for r in items:
            opening_qty = float(r.opening_stock or 0)
            opening_value = r.opening_value
            if opening_value is None:
                if r.opening_rate is not None:
                    opening_value = opening_qty * float(r.opening_rate)
                elif r.default_purchase_rate is not None:
                    opening_value = opening_qty * float(r.default_purchase_rate)
                elif r.default_sales_rate is not None:
                    opening_value = opening_qty * float(r.default_sales_rate)
                else:
                    opening_value = 0.0
            
            val = float(opening_value)
            
            if method == models.InventoryValuationMethod.FIFO:
                cost = (val / opening_qty) if opening_qty else 0.0
                if opening_qty > 0:
                    fifo_layers_by_item[int(r.id)] = [[opening_qty, cost]]
                else:
                    fifo_layers_by_item[int(r.id)] = []
            else:
                # For W.Avg, we track opening pool
                avg_cost_map[int(r.id)] = (opening_qty, val)

        # 3. Fetch StockLedger movements
        StockLedger = models.StockLedger
        
        if method == models.InventoryValuationMethod.FIFO:
            # For FIFO, we must replay all transactions in order
            ledger_rows = (
                self.db.query(
                    StockLedger.item_id,
                    StockLedger.qty_delta,
                    StockLedger.unit_cost,
                )
                .filter(
                    StockLedger.company_id == company.id,
                    StockLedger.item_id.in_(list(target_item_ids)),
                    StockLedger.reversed_at.is_(None),
                    func.date(StockLedger.posted_at) <= as_of,
                )
                .order_by(StockLedger.posted_at.asc(), StockLedger.id.asc())
                .all()
            )

            for r in ledger_rows:
                item_id = int(r.item_id)
                qty_delta = float(r.qty_delta or 0)
                
                # Ensure list exists (in case item wasn't in items query, though unlikely with filter)
                fifo_layers_by_item.setdefault(item_id, [])
                layers = fifo_layers_by_item[item_id]

                if qty_delta > 0:
                    # Inward: add layer
                    cost = float(r.unit_cost) if r.unit_cost is not None else 0.0
                    layers.append([qty_delta, cost])
                elif qty_delta < 0:
                    # Outward: consume layers
                    remaining = -qty_delta
                    while remaining > 1e-9 and layers:
                        layer_qty, layer_cost = layers[0]
                        take = layer_qty if layer_qty <= remaining else remaining
                        layer_qty -= take
                        remaining -= take
                        
                        if layer_qty <= 1e-9:
                            layers.pop(0)
                        else:
                            layers[0][0] = layer_qty
            
            # Build Result
            result: dict[int, StockProductSummary] = {}
            for item_id, layers in fifo_layers_by_item.items():
                qty_on_hand = sum(l[0] for l in layers)
                value = sum(l[0] * l[1] for l in layers)
                result[item_id] = StockProductSummary(
                    product_id=item_id,
                    qty_on_hand=float(qty_on_hand),
                    value=float(value)
                )
            return result

        else:
            # Weighted Average
            # We can use the simpler aggregate query approach for Periodic W.Avg
            # Total Cost / Total Qty (where Purchase/Opening are considered)
            
            # Fetch cost additions (Purchases)
            purchase_rows = (
                self.db.query(
                    StockLedger.item_id,
                    func.coalesce(func.sum(StockLedger.qty_delta), 0),
                    func.coalesce(func.sum(StockLedger.qty_delta * StockLedger.unit_cost), 0),
                )
                .filter(
                    StockLedger.company_id == company.id,
                    StockLedger.item_id.in_(list(target_item_ids)),
                    StockLedger.reversed_at.is_(None),
                    func.date(StockLedger.posted_at) <= as_of,
                    StockLedger.unit_cost.is_not(None),
                    StockLedger.source_type.in_(["PURCHASE_BILL", "PURCHASE_RETURN"]),
                )
                .group_by(StockLedger.item_id)
                .all()
            )
            
            # Also need current stock on hand (qty) from all movements
            qty_map = self.get_qty_on_hand_by_product(
                company_id=company.id, as_of=as_of, product_ids=list(target_item_ids)
            )

            # Map Purchase Data
            purchase_map = {int(pid): (float(qty or 0), float(val or 0)) for pid, qty, val in purchase_rows}

            # Build Result
            result: dict[int, StockProductSummary] = {}
            for item_id in target_item_ids:
                closing_qty = qty_map.get(item_id, 0.0)
                
                opening_qty, opening_val = avg_cost_map.get(item_id, (0.0, 0.0))
                cost_qty_delta, cost_val_delta = purchase_map.get(item_id, (0.0, 0.0))
                
                denom_qty = opening_qty + cost_qty_delta
                
                # Careful with negative denominations if returns > purchases (unlikely but possible)
                avg_cost = ((opening_val + cost_val_delta) / denom_qty) if denom_qty > 0 else 0.0
                
                closing_value = closing_qty * avg_cost
                
                result[item_id] = StockProductSummary(
                    product_id=item_id,
                    qty_on_hand=float(closing_qty),
                    value=float(closing_value)
                )
            return result

    def fifo_consume(
        self,
        *,
        tenant_id: int,
        product_id: int,
        qty_out: float,
        ref_type: str,
        ref_id: int | None,
        allow_negative: bool = False,
        fallback_rate: float = 0.0,
    ) -> float:
        """Consume FIFO batches. Returns total cost (COGS) for qty_out."""

        remaining = float(qty_out or 0)
        if remaining <= 0:
            return 0.0

        Batch = models.StockBatch

        batches = (
            self.db.query(Batch)
            .filter(
                Batch.tenant_id == tenant_id,
                Batch.product_id == product_id,
                (Batch.qty_in - Batch.qty_out) > 0,
            )
            .order_by(Batch.created_at.asc(), Batch.id.asc())
            .with_for_update()
            .all()
        )

        total_cost = 0.0
        for b in batches:
            if remaining <= 1e-9:
                break
            available = float(b.qty_in) - float(b.qty_out)
            if available <= 1e-9:
                continue
            take = available if available <= remaining else remaining
            b.qty_out = float(b.qty_out) + take
            total_cost += take * float(b.rate)
            remaining -= take
            self.db.add(b)

        if remaining > 1e-9:
            if allow_negative:
                total_cost += remaining * float(fallback_rate)
            else:
                raise HTTPException(status_code=409, detail="Insufficient stock (FIFO batches)")

        return total_cost

    def fifo_add_batch(
        self,
        *,
        tenant_id: int,
        product_id: int,
        qty_in: float,
        rate: float,
        ref_type: str,
        ref_id: int | None,
        created_at: datetime | None = None,
    ) -> models.StockBatch:
        if created_at is None:
            created_at = datetime.utcnow()
        batch = models.StockBatch(
            tenant_id=tenant_id,
            product_id=product_id,
            qty_in=float(qty_in),
            qty_out=0.0,
            rate=float(rate),
            ref_type=ref_type,
            ref_id=ref_id,
            created_at=created_at,
        )
        self.db.add(batch)
        self.db.flush()
        return batch
