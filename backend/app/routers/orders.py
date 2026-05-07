from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from datetime import datetime

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from .sales import _compute_sales_invoice_total_subquery, _compute_sales_invoice_paid_subquery, _payment_status
from ..dependencies import get_company_secure


router = APIRouter(prefix="/companies/{company_id}", tags=["orders"])


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


@router.post("/orders/sales", response_model=schemas.SalesOrderRead)
def create_sales_order(
    company_id: int,
    order_in: schemas.SalesOrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    # Validate sales_person_id if provided
    if order_in.sales_person_id is not None:
        sp = (
            db.query(models.SalesPerson)
            .filter(
                models.SalesPerson.company_id == company_id,
                models.SalesPerson.id == int(order_in.sales_person_id),
            )
            .first()
        )
        if sp is None:
            raise HTTPException(status_code=400, detail="Invalid sales_person_id")

    order = models.SalesOrder(
        company_id=company_id,
        customer_id=order_in.customer_id,
        date=order_in.date,
        due_date=order_in.due_date or order_in.date,
        reference=order_in.reference,
        sales_person_id=order_in.sales_person_id,
        status="OPEN",
    )
    db.add(order)
    db.flush()

    for line in order_in.lines:
        db.add(
            models.SalesOrderLine(
                order_id=order.id,
                item_id=line.item_id,
                quantity=line.quantity,
                rate=line.rate,
                discount=line.discount,
                tax_rate=line.tax_rate,
                hs_code=line.hs_code,
            )
        )

    notification = models.Notification(
        company_id=company_id,
        type="SALES_ORDER_CREATED",
        order_id=order.id,
    )
    db.add(notification)

    db.commit()
    db.refresh(order)
    return order


@router.post("/orders/purchase", response_model=schemas.PurchaseOrderRead)
def create_purchase_order(
    company_id: int,
    order_in: schemas.PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    order = models.PurchaseOrder(
        company_id=company_id,
        supplier_id=order_in.supplier_id,
        date=order_in.date,
        reference=order_in.reference,
        status="OPEN",
    )
    db.add(order)
    db.flush()

    for line in order_in.lines:
        db.add(
            models.PurchaseOrderLine(
                order_id=order.id,
                item_id=line.item_id,
                quantity=line.quantity,
                rate=line.rate,
                discount=line.discount,
                tax_rate=line.tax_rate,
                hs_code=line.hs_code,
            )
        )

    notification = models.Notification(
        company_id=company_id,
        type="PURCHASE_ORDER_CREATED",
        order_id=order.id,
    )
    db.add(notification)

    db.commit()
    db.refresh(order)
    return order


@router.get("/orders/sales", response_model=list[schemas.SalesOrderSummary])
def list_sales_orders(
    company_id: int,
    status: str = "OPEN",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    total_subq = _compute_sales_invoice_total_subquery().label("inv_total_amount")
    paid_subq = _compute_sales_invoice_paid_subquery(company_id=company_id).label("inv_paid_amount")

    q = (
        db.query(
            models.SalesOrder, 
            models.Customer, 
            models.SalesPerson,
            total_subq,
            paid_subq,
            models.PaymentMode.name.label("payment_mode_name")
        )
        .outerjoin(models.Customer, models.SalesOrder.customer_id == models.Customer.id)
        .outerjoin(models.SalesPerson, models.SalesPerson.id == models.SalesOrder.sales_person_id)
        .outerjoin(models.SalesInvoice, models.SalesInvoice.id == models.SalesOrder.converted_to_invoice_id)
        .outerjoin(models.Voucher, models.Voucher.id == models.SalesInvoice.voucher_id)
        .outerjoin(models.PaymentMode, models.PaymentMode.id == models.Voucher.payment_mode_id)
        .filter(models.SalesOrder.company_id == company_id)
    )
    if status:
        status_list = [s.strip() for s in status.split(',')]
        q = q.filter(models.SalesOrder.status.in_(status_list))

    rows = q.order_by(models.SalesOrder.date.desc(), models.SalesOrder.id.desc()).all()

    results: list[schemas.SalesOrderSummary] = []
    for order, customer, sales_person, inv_total, inv_paid, payment_mode_name in rows:
        order_lines = []
        total = 0.0
        for line in order.lines:
            line_total = float(line.quantity) * float(line.rate) - float(line.discount)
            tax = line_total * float(line.tax_rate) / 100.0
            total += line_total + tax
            
            order_lines.append(
                schemas.SalesOrderLineDetail(
                    item_id=line.item_id,
                    item_name=line.item.name if line.item else "Item",
                    category=line.item.category if line.item and line.item.category else None,
                    quantity=float(line.quantity),
                    rate=float(line.rate),
                    discount=float(line.discount),
                    tax_rate=float(line.tax_rate)
                )
            )

        payment_status = "UNPAID"
        if order.converted_to_invoice_id:
            inv_total_val = float(inv_total or 0)
            inv_paid_val = float(inv_paid or 0)
            is_credit = (payment_mode_name is None or payment_mode_name.strip().lower() == "credit")
            payment_status = _payment_status(total_amount=inv_total_val, paid_amount=inv_paid_val, is_credit=is_credit)

        results.append(
            schemas.SalesOrderSummary(
                id=order.id,
                voucher_date=order.date,
                voucher_number=order.reference,
                reference=order.reference,
                customer_id=customer.id if customer else None,
                customer_name=customer.name if customer else "Walk-in",
                customer_address=customer.address if customer else None,
                customer_email=customer.email if customer else None,
                customer_phone=customer.phone if customer else None,
                total_amount=total,
                due_date=order.due_date,
                sales_person_id=order.sales_person_id,
                sales_person_name=(sales_person.name if sales_person is not None else None),
                status=order.status,
                payment_status=payment_status,
                lines=order_lines
            )
        )

    return results


@router.get("/orders/purchase", response_model=list[schemas.PurchaseOrderSummary])
def list_purchase_orders(
    company_id: int,
    status: str = "OPEN",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    q = (
        db.query(models.PurchaseOrder, models.Supplier)
        .join(models.Supplier, models.PurchaseOrder.supplier_id == models.Supplier.id)
        .filter(models.PurchaseOrder.company_id == company_id)
    )
    if status:
        q = q.filter(models.PurchaseOrder.status == status)

    rows = q.order_by(models.PurchaseOrder.date.desc(), models.PurchaseOrder.id.desc()).all()

    results: list[schemas.PurchaseOrderSummary] = []
    for order, supplier in rows:
        total = 0.0
        for line in order.lines:
            subtotal = float(line.quantity) * float(line.rate) - float(line.discount)
            tax = subtotal * float(line.tax_rate) / 100.0
            total += subtotal + tax
        results.append(
            schemas.PurchaseOrderSummary(
                id=order.id,
                voucher_date=order.date,
                voucher_number=order.reference,
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                total_amount=total,
                status=order.status,
            )
        )

    return results


@router.get("/orders/sales/{order_id}", response_model=schemas.SalesOrderDetailRead)
def get_sales_order(
    company_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    order = (
        db.query(models.SalesOrder)
        .filter(
            models.SalesOrder.id == order_id,
            models.SalesOrder.company_id == company_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")

    # Fetch customer name & details
    customer = db.query(models.Customer).filter(models.Customer.id == order.customer_id).first()
    customer_name = customer.name if customer else None
    customer_address = customer.address if customer else None
    customer_email = customer.email if customer else None
    customer_phone = customer.phone if customer else None

    # Fetch sales person name
    sales_person_name = None
    if order.sales_person_id:
        sp = db.query(models.SalesPerson).filter(models.SalesPerson.id == order.sales_person_id).first()
        if sp:
            sales_person_name = sp.name

    payment_status = "UNPAID"
    if order.converted_to_invoice_id:
        total_subq = _compute_sales_invoice_total_subquery().label("inv_total")
        paid_subq = _compute_sales_invoice_paid_subquery(company_id=company_id).label("inv_paid")
        inv_data = (
            db.query(total_subq, paid_subq, models.PaymentMode.name)
            .select_from(models.SalesInvoice)
            .outerjoin(models.Voucher, models.Voucher.id == models.SalesInvoice.voucher_id)
            .outerjoin(models.PaymentMode, models.PaymentMode.id == models.Voucher.payment_mode_id)
            .filter(models.SalesInvoice.id == order.converted_to_invoice_id)
            .first()
        )
        if inv_data:
            inv_total, inv_paid, pm_name = inv_data
            is_credit = pm_name is None or pm_name.strip().lower() == "credit"
            payment_status = _payment_status(total_amount=float(inv_total or 0), paid_amount=float(inv_paid or 0), is_credit=is_credit)

    # Fetch item details to get names and categories
    item_ids = [line.item_id for line in order.lines]
    items = db.query(models.Item).filter(models.Item.id.in_(item_ids)).all()
    item_map = {item.id: {"name": item.name, "category": item.category} for item in items}

    lines = []
    for line in order.lines:
        lines.append({
            "item_id": line.item_id,
            "quantity": line.quantity,
            "rate": line.rate,
            "discount": line.discount,
            "tax_rate": line.tax_rate,
            "item_name": item_map.get(line.item_id, {}).get("name"),
            "category": item_map.get(line.item_id, {}).get("category")
        })

    result = schemas.SalesOrderDetailRead(
        id=order.id,
        customer_id=order.customer_id,
        date=order.date,
        due_date=order.due_date,
        reference=order.reference,
        sales_person_id=order.sales_person_id,
        status=order.status,
        converted_to_invoice_id=order.converted_to_invoice_id,
        customer_name=customer_name,
        customer_address=customer_address,
        customer_email=customer_email,
        customer_phone=customer_phone,
        sales_person_name=sales_person_name,
        payment_status=payment_status,
        lines=lines
    )
    return result


@router.put("/orders/sales/{order_id}", response_model=schemas.SalesOrderRead)
def update_sales_order(
    company_id: int,
    order_id: int,
    payload: schemas.SalesOrderUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    order = (
        db.query(models.SalesOrder)
        .filter(
            models.SalesOrder.id == order_id,
            models.SalesOrder.company_id == company_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")

    if order.status not in ["OPEN", "PROCESSING"]:
        raise HTTPException(status_code=400, detail="Only OPEN or PROCESSING orders can be updated")

    old_date = order.date
    data = payload.model_dump(exclude_unset=True, exclude={"lines"})

    if "sales_person_id" in data:
        if payload.sales_person_id is not None:
            sp = (
                db.query(models.SalesPerson)
                .filter(
                    models.SalesPerson.company_id == company_id,
                    models.SalesPerson.id == int(payload.sales_person_id),
                )
                .first()
            )
            if sp is None:
                raise HTTPException(status_code=400, detail="Invalid sales_person_id")

    for field, value in data.items():
        if field in {"customer_id", "date"} and value is None:
            continue
        setattr(order, field, value)

    explicit_due_date_sent = "due_date" in data
    if explicit_due_date_sent and payload.due_date is None:
        order.due_date = order.date
    elif ("date" in data) and not explicit_due_date_sent:
        if order.due_date is None or order.due_date == old_date:
            order.due_date = order.date
    elif order.due_date is None:
        order.due_date = order.date

    if payload.lines is not None:
        db.query(models.SalesOrderLine).filter(models.SalesOrderLine.order_id == order.id).delete()
        for line in payload.lines:
            db.add(
                models.SalesOrderLine(
                    order_id=order.id,
                    item_id=line.item_id,
                    quantity=line.quantity,
                    rate=line.rate,
                    discount=line.discount,
                    tax_rate=line.tax_rate,
                    hs_code=line.hs_code,
                )
            )

    db.commit()
    db.refresh(order)
    return order


@router.get("/orders/purchase/{order_id}", response_model=schemas.PurchaseOrderRead)
def get_purchase_order(
    company_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    order = (
        db.query(models.PurchaseOrder)
        .filter(
            models.PurchaseOrder.id == order_id,
            models.PurchaseOrder.company_id == company_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return order


@router.post("/orders/sales/{order_id}/cancel")
def cancel_sales_order(
    company_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    order = (
        db.query(models.SalesOrder)
        .filter(
            models.SalesOrder.id == order_id,
            models.SalesOrder.company_id == company_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")
    if order.status not in ["OPEN", "PROCESSING"]:
        raise HTTPException(status_code=400, detail="Only open or processing orders can be cancelled")

    order.status = "CANCELLED"
    db.commit()
    return {"message": "Order cancelled successfully", "order_id": order_id}


@router.post("/orders/sales/{order_id}/convert-to-invoice")
def convert_sales_order_to_invoice(
    company_id: int,
    order_id: int,
    payload: dict | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    order = (
        db.query(models.SalesOrder)
        .filter(
            models.SalesOrder.id == order_id,
            models.SalesOrder.company_id == company_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Sales order not found")
    if order.status not in ["OPEN", "PROCESSING"]:
        raise HTTPException(status_code=400, detail="Order is not open or processing")

    payload = payload or {}
    override_date = payload.get("date")
    override_reference = payload.get("reference")
    override_lines = payload.get("override_lines")
    payment_mode_id = payload.get("payment_mode_id")

    lines_data = override_lines or [
        {
            "item_id": l.item_id,
            "quantity": float(l.quantity),
            "rate": float(l.rate),
            "discount": float(l.discount),
            "tax_rate": float(l.tax_rate),
            "hs_code": l.hs_code,
            "warehouse_id": getattr(l, "warehouse_id", None),
        }
        for l in order.lines
    ]

    invoice_in = schemas.SalesInvoiceCreate(
        customer_id=order.customer_id,
        date=override_date or order.date,
        due_date=order.due_date or (override_date or order.date),
        sales_person_id=order.sales_person_id,
        reference=override_reference or order.reference,
        lines=[schemas.SalesInvoiceLine(**ld) for ld in lines_data],
    )

    # Resolve header-level sales ledger and output tax ledger defaults
    sales_ledger_id = getattr(company, "default_sales_ledger_id", None)
    if sales_ledger_id is None:
        sales_ledger = db.query(models.Ledger).filter(models.Ledger.company_id == company_id, models.Ledger.code == "SALES").first()
        if sales_ledger:
            sales_ledger_id = sales_ledger.id

    output_tax_ledger_id = None
    output_tax_ledger = db.query(models.Ledger).filter(models.Ledger.company_id == company_id, models.Ledger.code.in_(["OUTPUT_TAX", "OUTPUT_VAT"])).first()
    if output_tax_ledger:
        output_tax_ledger_id = output_tax_ledger.id

    invoice = models.SalesInvoice(
        company_id=company_id,
        customer_id=invoice_in.customer_id,
        date=invoice_in.date,
        due_date=invoice_in.due_date or invoice_in.date,
        sales_person_id=invoice_in.sales_person_id,
        reference=invoice_in.reference,
        sales_ledger_id=sales_ledger_id,
        output_tax_ledger_id=output_tax_ledger_id,
        invoice_type="PRODUCT", # Default for conversion unless overridden
    )
    db.add(invoice)
    db.flush()

    default_warehouse = None
    for line in invoice_in.lines:
        eff_warehouse_id = line.warehouse_id
        if eff_warehouse_id is None:
            if default_warehouse is None:
                default_warehouse = (
                    db.query(models.Warehouse)
                    .filter(
                        models.Warehouse.company_id == company_id,
                        models.Warehouse.name == "Main",
                        models.Warehouse.is_active == True,
                    )
                    .first()
                )
                if not default_warehouse:
                    # Try first active warehouse
                    default_warehouse = db.query(models.Warehouse).filter(models.Warehouse.company_id == company_id, models.Warehouse.is_active == True).first()
                if not default_warehouse:
                    raise HTTPException(status_code=400, detail="No active warehouse found for company. Please create one.")
            eff_warehouse_id = default_warehouse.id

        db.add(
            models.SalesInvoiceLine(
                invoice_id=invoice.id,
                item_id=line.item_id,
                quantity=line.quantity,
                rate=line.rate,
                discount=line.discount,
                tax_rate=line.tax_rate,
                hs_code=line.hs_code,
                warehouse_id=eff_warehouse_id,
            )
        )

    from .sales import _build_sales_voucher  # type: ignore

    # Build the corresponding SALES_INVOICE voucher. 
    voucher = _build_sales_voucher(
        db,
        company_id,
        invoice,
        payment_mode_id=payment_mode_id,
        sales_ledger_id=invoice.sales_ledger_id,
        output_tax_ledger_id=invoice.output_tax_ledger_id,
    )
    invoice.voucher_id = voucher.id
    order.status = "CONVERTED"
    order.converted_to_invoice_id = invoice.id
    db.commit()
    db.refresh(invoice)
    
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.reference or str(invoice.id),
        "order_id": order.id,
        "status": "CREATED",
    }


@router.post("/orders/purchase/{order_id}/convert-to-bill")
def convert_purchase_order_to_bill(
    company_id: int,
    order_id: int,
    payload: dict | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    order = (
        db.query(models.PurchaseOrder)
        .filter(
            models.PurchaseOrder.id == order_id,
            models.PurchaseOrder.company_id == company_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if order.status != "OPEN":
        raise HTTPException(status_code=400, detail="Order is not open")

    payload = payload or {}
    override_date = payload.get("date")
    override_reference = payload.get("reference")
    override_lines = payload.get("override_lines")
    payment_mode_id = payload.get("payment_mode_id")

    lines_data = override_lines or [
        {
            "item_id": l.item_id,
            "quantity": float(l.quantity),
            "rate": float(l.rate),
            "discount": float(l.discount),
            "tax_rate": float(l.tax_rate),
            "hs_code": l.hs_code,
        }
        for l in order.lines
    ]

    bill_in = schemas.PurchaseBillCreate(
        supplier_id=order.supplier_id,
        date=override_date or order.date,
        reference=override_reference or order.reference,
        lines=[schemas.PurchaseBillLine(**ld) for ld in lines_data],
    )

    bill = models.PurchaseBill(
        company_id=company_id,
        supplier_id=bill_in.supplier_id,
        date=bill_in.date,
        reference=bill_in.reference,
    )
    db.add(bill)
    db.flush()

    default_warehouse = None

    for line in bill_in.lines:
        effective_warehouse_id = getattr(line, "warehouse_id", None)
        if effective_warehouse_id is None:
            if default_warehouse is None:
                default_warehouse = (
                    db.query(models.Warehouse)
                    .filter(
                        models.Warehouse.company_id == company_id,
                        models.Warehouse.name == "Main",
                        models.Warehouse.is_active == True,
                    )
                    .first()
                )
                if not default_warehouse:
                    raise HTTPException(status_code=400, detail="Default warehouse 'Main' not found")
            effective_warehouse_id = default_warehouse.id

        warehouse = (
            db.query(models.Warehouse)
            .filter(
                models.Warehouse.id == effective_warehouse_id,
                models.Warehouse.company_id == company_id,
                models.Warehouse.is_active == True,
            )
            .first()
        )
        if not warehouse:
            raise HTTPException(status_code=400, detail="Invalid warehouse_id")

        bill_line = models.PurchaseBillLine(
            bill_id=bill.id,
            item_id=line.item_id,
            quantity=line.quantity,
            rate=line.rate,
            discount=line.discount,
            tax_rate=line.tax_rate,
            hs_code=line.hs_code,
            warehouse_id=effective_warehouse_id,
        )
        db.add(bill_line)
        db.flush()

        db.add(
            models.StockLedger(
                company_id=company_id,
                warehouse_id=effective_warehouse_id,
                item_id=line.item_id,
                qty_delta=float(line.quantity),
                unit_cost=None,
                source_type="PURCHASE_BILL",
                source_id=bill.id,
                source_line_id=bill_line.id,
                posted_at=datetime.utcnow(),
                created_by=current_user.id,
            )
        )
        db.add(
            models.StockMovement(
                company_id=company_id,
                warehouse_id=effective_warehouse_id,
                item_id=line.item_id,
                movement_date=bill.date,
                source_type="PURCHASE_BILL",
                source_id=bill.id,
                qty_in=line.quantity,
                qty_out=0,
            )
        )

    from .purchases import _build_purchase_voucher  # type: ignore

    # Build the corresponding PURCHASE_BILL voucher. When converting from an
    # order, accept payment_mode_id when provided in the payload.
    _build_purchase_voucher(
        db,
        company_id,
        bill,
        payment_mode_id=payment_mode_id,
        purchase_ledger_id=bill.purchase_ledger_id,
        input_tax_ledger_id=bill.input_tax_ledger_id,
    )

    order.status = "CONVERTED"
    order.converted_to_bill_id = bill.id

    db.commit()

    return {
        "bill_id": bill.id,
        "bill_number": bill.reference or str(bill.id),
        "order_id": order.id,
        "status": "CREATED",
    }
