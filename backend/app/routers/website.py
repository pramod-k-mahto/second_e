from __future__ import annotations

import hmac
import hashlib
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import MetaData, Table, func

from .. import models, schemas
from ..database import get_db
from ..voucher_service import get_next_voucher_number


router = APIRouter(tags=["website"])


def _verify_hmac_signature(*, secret: str, body: bytes, signature: str) -> bool:
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _get_company(db: Session, *, company_id: int) -> models.Company:
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _get_company_settings_row(db: Session, *, company_id: int) -> dict:
    bind = db.get_bind()
    md = MetaData()
    try:
        table = Table("company_settings", md, autoload_with=bind)
    except Exception:
        raise HTTPException(status_code=400, detail="Company settings not configured")

    if "company_id" not in table.c:
        raise HTTPException(status_code=400, detail="Company settings not configured")

    row = (
        db.execute(table.select().where(table.c.company_id == int(company_id)).limit(1))
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status_code=400, detail="Company settings not configured")
    return dict(row)


def _get_company_settings_by_api_key(db: Session, *, api_key: str, company_id: int | None = None) -> dict:
    bind = db.get_bind()
    md = MetaData()
    try:
        table = Table("company_settings", md, autoload_with=bind)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid website API key")

    if "website_api_key" not in table.c:
        raise HTTPException(status_code=501, detail="Website integration not enabled on this database")

    query = table.select().where(table.c.website_api_key == str(api_key))
    if company_id is not None:
        query = query.where(table.c.company_id == int(company_id))

    row = (
        db.execute(query.limit(1))
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid website API key")
    return dict(row)




def _create_receipt_voucher_for_invoice(
    db: Session,
    *,
    company_id: int,
    invoice: models.SalesInvoice,
    payment_mode_id: int,
) -> models.Voucher:
    payment_mode = (
        db.query(models.PaymentMode)
        .filter(
            models.PaymentMode.id == payment_mode_id,
            models.PaymentMode.company_id == company_id,
            models.PaymentMode.is_active == True,
        )
        .first()
    )
    if not payment_mode:
        raise HTTPException(status_code=400, detail="Invalid receipt_payment_mode_id")

    customer = (
        db.query(models.Customer)
        .filter(
            models.Customer.company_id == company_id,
            models.Customer.id == int(invoice.customer_id),
        )
        .first()
    )
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found")

    # Compute invoice total.
    total = 0.0
    for line in getattr(invoice, "lines", []) or []:
        subtotal = float(line.quantity) * float(line.rate) - float(line.discount)
        tax = subtotal * float(line.tax_rate) / 100.0
        total += subtotal + tax

    voucher_number, fiscal_year, next_seq = get_next_voucher_number(
        db, company_id, models.VoucherType.RECEIPT, invoice.date
    )

    voucher = models.Voucher(
        company_id=company_id,
        voucher_date=invoice.date,
        voucher_type=models.VoucherType.RECEIPT,
        fiscal_year=fiscal_year,
        voucher_sequence=next_seq,
        voucher_number=voucher_number,
        narration=f"Website payment received for invoice {invoice.reference or invoice.id}",
        payment_mode_id=payment_mode_id,
    )
    db.add(voucher)
    db.flush()

    cash_ledger_id = int(payment_mode.ledger_id)
    customer_ledger_id = int(customer.ledger_id)

    # Receipt: DR cash/bank, CR customer
    db.add(
        models.VoucherLine(
            voucher_id=voucher.id,
            ledger_id=cash_ledger_id,
            debit=float(total),
            credit=0,
        )
    )
    db.add(
        models.VoucherLine(
            voucher_id=voucher.id,
            ledger_id=customer_ledger_id,
            debit=0,
            credit=float(total),
        )
    )

    # Allocate receipt against invoice.
    db.add(
        models.VoucherAllocation(
            company_id=company_id,
            voucher_id=voucher.id,
            party_ledger_id=customer_ledger_id,
            doc_type=models.AllocationDocType.SALES_INVOICE.value,
            doc_id=int(invoice.id),
            allocated_amount=float(total),
        )
    )

    return voucher


def _queue_customer_messages(
    db: Session,
    *,
    company_id: int,
    customer: models.Customer,
    invoice: models.SalesInvoice | None,
    channels: list[str],
) -> list[int]:
    ids: list[int] = []
    ref = None
    if invoice is not None:
        ref = invoice.reference or str(invoice.id)
    subject = "Order Confirmation" if invoice is None else f"Invoice {ref}"
    body = (
        f"Thank you {customer.name}. "
        + ("Your order has been placed." if invoice is None else f"Your invoice is {ref}.")
    )

    for ch in channels:
        recipient = None
        if ch == "EMAIL":
            recipient = customer.email
        else:
            recipient = customer.phone
        if not recipient:
            continue

        msg = models.OutboundMessage(
            company_id=company_id,
            channel=ch,
            recipient=str(recipient),
            subject=subject if ch == "EMAIL" else None,
            body=body,
            status="PENDING",
            source_type="SALES_INVOICE" if invoice is not None else "SALES_ORDER",
            source_id=int(invoice.id) if invoice is not None else None,
        )
        db.add(msg)
        db.flush()
        ids.append(int(msg.id))
    return ids


def _find_or_create_customer(
    db: Session,
    *,
    company_id: int,
    tenant_id: int,
    customer: schemas.WebsiteCustomer,
) -> models.Customer:
    q = db.query(models.Customer).filter(models.Customer.company_id == company_id)

    if customer.email:
        existing = q.filter(models.Customer.email == customer.email).first()
        if existing is not None:
            return existing

    if customer.phone:
        existing = q.filter(models.Customer.phone == customer.phone).first()
        if existing is not None:
            return existing

    default_ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.company_id == company_id,
            models.Ledger.code == "CUSTOMERS",
        )
        .first()
    )
    if not default_ledger:
        raise HTTPException(
            status_code=400,
            detail="Default 'Customers' ledger not found. Please seed the default chart.",
        )

    customer_row = models.Customer(
        company_id=company_id,
        tenant_id=tenant_id,
        ledger_id=default_ledger.id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        address=customer.address,
        shipping_address=customer.shipping_address,
        shipping_phone=customer.shipping_phone,
        shipping_address_same_as_billing=customer.shipping_address_same_as_billing,
        created_by_id=None,
        updated_by_id=None,
    )
    db.add(customer_row)
    db.flush()
    return customer_row


@router.get("/companies/{company_id}/items", response_model=list[schemas.ItemRead])
async def get_website_items(
    company_id: int,
    request: Request,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    api_key = request.headers.get("X-Website-Api-Key")
    signature = request.headers.get("X-Website-Signature")

    if not api_key or not signature:
        raise HTTPException(
            status_code=400,
            detail="Missing required headers: X-Website-Api-Key, X-Website-Signature",
        )

    body = await request.body()

    settings = _get_company_settings_by_api_key(db, api_key=str(api_key), company_id=company_id)
    if int(settings.get("company_id", 0) or 0) != int(company_id):
        raise HTTPException(status_code=403, detail="API key does not match company")

    if not settings.get("website_api_secret"):
        raise HTTPException(status_code=400, detail="Website integration not configured")

    if not _verify_hmac_signature(secret=settings["website_api_secret"], body=body, signature=signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    q = db.query(models.Item).filter(
        models.Item.company_id == company_id,
        models.Item.show_in_online_store == True
    )

    if search:
        search_filter = f"%{search}%"
        q = q.filter(
            (models.Item.name.ilike(search_filter)) | (models.Item.description.ilike(search_filter))
        )

    items = q.all()
    return items


@router.get("/companies/{company_id}/items/{item_id}", response_model=schemas.ItemRead)
async def get_website_item(
    company_id: int,
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    api_key = request.headers.get("X-Website-Api-Key")
    signature = request.headers.get("X-Website-Signature")

    if not api_key or not signature:
        raise HTTPException(
            status_code=400,
            detail="Missing required headers: X-Website-Api-Key, X-Website-Signature",
        )

    body = await request.body()

    settings = _get_company_settings_by_api_key(db, api_key=str(api_key), company_id=company_id)
    if int(settings.get("company_id", 0) or 0) != int(company_id):
        raise HTTPException(status_code=403, detail="API key does not match company")

    if not settings.get("website_api_secret"):
        raise HTTPException(status_code=400, detail="Website integration not configured")

    if not _verify_hmac_signature(secret=settings["website_api_secret"], body=body, signature=signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    item = (
        db.query(models.Item)
        .filter(models.Item.company_id == company_id, models.Item.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if not getattr(item, "show_in_online_store", False):
        raise HTTPException(status_code=403, detail="Item not published online")

    return item


@router.get("/companies/{company_id}/info")
async def get_website_company_info(
    company_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Public endpoint — returns company name + payment QR URL.
    Authenticated with the same HMAC-signed API key as other website endpoints."""
    api_key = request.headers.get("X-Website-Api-Key")
    signature = request.headers.get("X-Website-Signature")

    if not api_key or not signature:
        raise HTTPException(
            status_code=400,
            detail="Missing required headers: X-Website-Api-Key, X-Website-Signature",
        )

    body = await request.body()
    settings = _get_company_settings_by_api_key(db, api_key=str(api_key), company_id=company_id)
    if int(settings.get("company_id", 0) or 0) != int(company_id):
        raise HTTPException(status_code=403, detail="API key does not match company")

    if not settings.get("website_api_secret"):
        raise HTTPException(status_code=400, detail="Website integration not configured")

    if not _verify_hmac_signature(secret=settings["website_api_secret"], body=body, signature=signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    company = _get_company(db, company_id=company_id)
    return {
        "company_id": company_id,
        "company_name": company.name,
        "payment_qr_url": settings.get("payment_qr_url") or None,
    }


@router.post("/companies/{company_id}/orders", response_model=schemas.WebsiteOrderResult)
async def create_website_order(
    company_id: int,
    request: Request,
    payload: schemas.WebsiteOrderCreate,
    db: Session = Depends(get_db),
):
    api_key = request.headers.get("X-Website-Api-Key")
    signature = request.headers.get("X-Website-Signature")
    idempotency_key = request.headers.get("Idempotency-Key")

    if not api_key or not signature or not idempotency_key:
        raise HTTPException(
            status_code=400,
            detail="Missing required headers: X-Website-Api-Key, X-Website-Signature, Idempotency-Key",
        )

    body = await request.body()

    # Resolve integration settings by API key first, then enforce companyId match.
    settings = _get_company_settings_by_api_key(db, api_key=str(api_key), company_id=company_id)
    if int(settings.get("company_id", 0) or 0) != int(company_id):
        raise HTTPException(status_code=403, detail="API key does not match company")

    if not settings.get("website_api_secret"):
        raise HTTPException(status_code=400, detail="Website integration not configured")

    if not _verify_hmac_signature(secret=settings["website_api_secret"], body=body, signature=signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    request_hash = hashlib.sha256(body).hexdigest()

    existing = (
        db.query(models.WebsiteOrderReceipt)
        .filter(
            models.WebsiteOrderReceipt.company_id == company_id,
            models.WebsiteOrderReceipt.idempotency_key == idempotency_key,
        )
        .first()
    )
    if existing is not None:
        # If the idempotency key is reused with a different request, reject.
        if getattr(existing, "request_hash", None) and str(existing.request_hash) != str(request_hash):
            raise HTTPException(status_code=409, detail="Idempotency-Key already used with different payload")

        # Prefer returning the stored response payload when available.
        if getattr(existing, "response_json", None):
            try:
                stored = schemas.WebsiteOrderResult(**existing.response_json)
                # For idempotent replays, always report EXISTS even if the stored
                # payload was captured on the initial CREATED response.
                stored.status = "EXISTS"
                return stored
            except Exception:
                # Fallback to legacy reconstruction if schema shape changed.
                pass

        invoice_id = (
            db.query(models.SalesOrder.converted_to_invoice_id)
            .filter(
                models.SalesOrder.company_id == company_id,
                models.SalesOrder.id == existing.sales_order_id,
            )
            .scalar()
        )
        invoice_number = None
        if invoice_id is not None:
            invoice_number = (
                db.query(models.SalesInvoice.reference)
                .filter(
                    models.SalesInvoice.company_id == company_id,
                    models.SalesInvoice.id == int(invoice_id),
                )
                .scalar()
            )

        receipt_voucher_id = int(getattr(existing, "receipt_voucher_id", None) or 0) or None

        outbound_ids: list[int] = []
        if invoice_id is not None:
            outbound_ids = [
                int(r[0])
                for r in (
                    db.query(models.OutboundMessage.id)
                    .filter(
                        models.OutboundMessage.company_id == company_id,
                        models.OutboundMessage.source_type == "SALES_INVOICE",
                        models.OutboundMessage.source_id == int(invoice_id),
                    )
                    .order_by(models.OutboundMessage.id.asc())
                    .all()
                )
            ]
        result = schemas.WebsiteOrderResult(
            order_id=existing.sales_order_id,
            status="EXISTS",
            invoice_id=int(invoice_id) if invoice_id is not None else None,
            invoice_number=str(invoice_number) if invoice_number else (str(invoice_id) if invoice_id is not None else None),
            receipt_voucher_id=receipt_voucher_id,
            outbound_message_ids=outbound_ids,
        )
        existing.request_hash = existing.request_hash or request_hash
        existing.response_json = result.model_dump()
        db.add(existing)
        db.commit()
        return result

    company = _get_company(db, company_id=company_id)

    customer = _find_or_create_customer(
        db,
        company_id=company_id,
        tenant_id=int(company.tenant_id),
        customer=payload.customer,
    )

    order = models.SalesOrder(
        company_id=company_id,
        customer_id=customer.id,
        date=payload.date or date.today(),
        reference=payload.reference,
        status="OPEN",
    )
    db.add(order)
    db.flush()

    for line in payload.lines:
        db.add(
            models.SalesOrderLine(
                order_id=order.id,
                item_id=line.item_id,
                quantity=line.quantity,
                rate=line.rate,
                discount=line.discount,
                tax_rate=line.tax_rate,
            )
        )

    db.add(
        models.WebsiteOrderReceipt(
            company_id=company_id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            external_reference=payload.reference,
            transaction_id=payload.transaction_id,
            payment_screenshot=payload.payment_screenshot,
            sales_order_id=order.id,
        )
    )

    options = payload.options or schemas.WebsiteOrderOptions()

    if options.notify_internal:
        db.add(
            models.Notification(
                company_id=company_id,
                type="WEBSITE_ORDER_CREATED",
                order_id=order.id,
            )
        )

    invoice_id: int | None = None
    invoice_number: str | None = None
    receipt_voucher_id: int | None = None
    outbound_message_ids: list[int] = []
    
    # Check for service items to trigger auto-invoicing if not explicitly requested
    has_service = False
    all_service = True
    for line in payload.lines:
        item = (
            db.query(models.Item)
            .filter(models.Item.id == line.item_id, models.Item.company_id == company_id)
            .first()
        )
        is_item_service = False
        if item and item.category:
            cat_lower = str(item.category).strip().lower()
            if cat_lower in ["service", "services"]:
                is_item_service = True
        
        if is_item_service:
            has_service = True
        else:
            all_service = False
            
    if options.auto_invoice or has_service:
        # Resolve header-level sales ledger and output tax ledger from seeded
        # defaults when not explicitly provided.
        effective_sales_ledger_id = getattr(company, "default_sales_ledger_id", None)
        if effective_sales_ledger_id is None:
            sales_ledger = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.company_id == company_id,
                    models.Ledger.code == "SALES",
                )
                .first()
            )
            if sales_ledger is not None:
                effective_sales_ledger_id = sales_ledger.id

        effective_output_tax_ledger_id = getattr(company, "default_output_tax_ledger_id", None)
        if effective_output_tax_ledger_id is None:
            output_tax_ledger = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.company_id == company_id,
                    models.Ledger.code.in_(["OUTPUT_TAX", "OUTPUT_VAT"]),
                )
                .first()
            )
            if output_tax_ledger is not None:
                effective_output_tax_ledger_id = output_tax_ledger.id

        invoice_in = schemas.SalesInvoiceCreate(
            customer_id=order.customer_id,
            date=order.date,
            reference=order.reference,
            lines=[
                schemas.SalesInvoiceLine(
                    item_id=int(l.item_id),
                    quantity=float(l.quantity),
                    rate=float(l.rate),
                    discount=float(l.discount),
                    tax_rate=float(l.tax_rate),
                )
                for l in payload.lines
            ],
            payment_mode_id=options.invoice_payment_mode_id,
        )

        invoice = models.SalesInvoice(
            company_id=company_id,
            customer_id=invoice_in.customer_id,
            date=invoice_in.date,
            reference=invoice_in.reference,
            sales_ledger_id=effective_sales_ledger_id,
            output_tax_ledger_id=effective_output_tax_ledger_id,
            invoice_type="SERVICE" if all_service else "PRODUCT",
            sales_person_id=order.sales_person_id,
        )
        db.add(invoice)
        db.flush()

        for line in invoice_in.lines:
            inv_line = models.SalesInvoiceLine(
                item_id=line.item_id,
                quantity=line.quantity,
                rate=line.rate,
                discount=line.discount,
                tax_rate=line.tax_rate,
                warehouse_id=None, # Service or online auto-invoice
            )
            invoice.lines.append(inv_line)
        
        db.flush()

        from .sales import _build_sales_voucher  # type: ignore

        voucher = _build_sales_voucher(
            db,
            company_id,
            invoice,
            payment_mode_id=invoice_in.payment_mode_id,
            sales_ledger_id=invoice.sales_ledger_id,
            output_tax_ledger_id=invoice.output_tax_ledger_id,
        )
        invoice.voucher_id = voucher.id

        order.status = "CONVERTED"
        order.converted_to_invoice_id = invoice.id
        
        db.add(order) # Mark as converted
        db.flush()

        invoice_id = int(invoice.id)
        invoice_number = invoice.reference or str(invoice.id)


        if options.notify_internal:
            db.add(
                models.Notification(
                    company_id=company_id,
                    type="WEBSITE_ORDER_INVOICED",
                    order_id=order.id,
                )
            )

    # record_payment requires an invoice.
    if options.record_payment:
        if invoice_id is None:
            raise HTTPException(status_code=400, detail="record_payment requires auto_invoice=true")
        if options.receipt_payment_mode_id is None:
            raise HTTPException(status_code=400, detail="receipt_payment_mode_id is required when record_payment=true")

        inv = (
            db.query(models.SalesInvoice)
            .filter(models.SalesInvoice.company_id == company_id, models.SalesInvoice.id == int(invoice_id))
            .first()
        )
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")

        # Ensure invoice lines are available for total calculation.
        _ = getattr(inv, "lines", None)

        receipt = _create_receipt_voucher_for_invoice(
            db,
            company_id=company_id,
            invoice=inv,
            payment_mode_id=int(options.receipt_payment_mode_id),
        )
        receipt_voucher_id = int(receipt.id)
        receipt_row = (
            db.query(models.WebsiteOrderReceipt)
            .filter(
                models.WebsiteOrderReceipt.company_id == company_id,
                models.WebsiteOrderReceipt.idempotency_key == idempotency_key,
            )
            .first()
        )
        if receipt_row is not None:
            receipt_row.receipt_voucher_id = receipt.id

        if options.notify_internal:
            db.add(
                models.Notification(
                    company_id=company_id,
                    type="WEBSITE_PAYMENT_RECORDED",
                    order_id=order.id,
                )
            )

    if options.notify_customer:
        channels = options.notify_channels or ["EMAIL", "SMS", "WHATSAPP"]
        invoice_for_msg = None
        if invoice_id is not None:
            invoice_for_msg = (
                db.query(models.SalesInvoice)
                .filter(models.SalesInvoice.company_id == company_id, models.SalesInvoice.id == int(invoice_id))
                .first()
            )
        customer_row = (
            db.query(models.Customer)
            .filter(models.Customer.company_id == company_id, models.Customer.id == int(order.customer_id))
            .first()
        )
        if customer_row is not None:
            outbound_message_ids = _queue_customer_messages(
                db,
                company_id=company_id,
                customer=customer_row,
                invoice=invoice_for_msg,
                channels=[str(c).upper() for c in channels],
            )

        if options.notify_internal:
            db.add(
                models.Notification(
                    company_id=company_id,
                    type="WEBSITE_CUSTOMER_NOTIFIED",
                    order_id=order.id,
                )
            )

    total_amount: float | None = None
    tax_amount: float | None = None
    result_lines: list[schemas.WebsiteOrderLine] | None = None

    if invoice_id is not None:
        inv = db.query(models.SalesInvoice).filter(models.SalesInvoice.id == invoice_id).first()
        if inv:
            total_amount = 0.0
            tax_amount = 0.0
            result_lines = []
            for ln in inv.lines:
                base = float(ln.quantity) * float(ln.rate) - float(ln.discount)
                tax = base * float(ln.tax_rate) / 100.0
                total_amount += (base + tax)
                tax_amount += tax
                result_lines.append(schemas.WebsiteOrderLine(
                    item_id=int(ln.item_id),
                    quantity=float(ln.quantity),
                    rate=float(ln.rate),
                    discount=float(ln.discount),
                    tax_rate=float(ln.tax_rate)
                ))

    result = schemas.WebsiteOrderResult(
        order_id=order.id,
        status="CREATED",
        invoice_id=invoice_id,
        invoice_number=invoice_number,
        receipt_voucher_id=receipt_voucher_id,
        outbound_message_ids=outbound_message_ids,
        total_amount=total_amount,
        tax_amount=tax_amount,
        lines=result_lines,
    )

    receipt_row = (
        db.query(models.WebsiteOrderReceipt)
        .filter(
            models.WebsiteOrderReceipt.company_id == company_id,
            models.WebsiteOrderReceipt.idempotency_key == idempotency_key,
        )
        .first()
    )
    if receipt_row is not None:
        receipt_row.request_hash = receipt_row.request_hash or request_hash
        receipt_row.response_json = result.model_dump()
        db.add(receipt_row)

    db.commit()

    return result
