def _rebuild_sales_voucher_lines(
    db: Session,
    company_id: int,
    voucher: models.Voucher,
    invoice: models.SalesInvoice,
    payment_mode_id: int | None,
    sales_ledger_id: int | None = None,
    output_tax_ledger_id: int | None = None,
    payment_ledger_id: int | None = None,
) -> None:
    """Rebuild voucher lines for an existing voucher without creating a new one."""
    customer = (
        db.query(models.Customer)
        .filter(
            models.Customer.id == invoice.customer_id,
            models.Customer.company_id == company_id,
        )
        .first()
    )
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found")

    # Aggregate lines by income and tax ledgers
    income_totals: dict[int, float] = {}
    tax_totals: dict[int, float] = {}
    header_income_total = 0.0
    header_tax_total = 0.0
    grand_total = 0.0

    cogs_total = 0.0
    cogs_lines: list[tuple[int, float]] = []

    for line in invoice.lines:
        item = (
            db.query(models.Item)
            .filter(
                models.Item.id == line.item_id,
                models.Item.company_id == company_id,
            )
            .first()
        )
        if not item:
            raise HTTPException(status_code=400, detail=f"Item {line.item_id} not found")
        subtotal = float(line.quantity) * float(line.rate) - float(line.discount)
        tax = subtotal * float(line.tax_rate) / 100.0
        grand_total += subtotal + tax

        # Standard-cost COGS posting: only for stock-tracked items.
        if not bool(item.allow_negative_stock):
            if item.default_purchase_rate is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Item {item.id} missing default_purchase_rate for COGS calculation",
                )
            line_cost = float(line.quantity) * float(item.default_purchase_rate)
            if line_cost:
                cogs_total += line_cost
                cogs_lines.append((item.id, line_cost))

        if sales_ledger_id is not None:
            header_income_total += subtotal
        else:
            if not item.income_ledger_id:
                raise HTTPException(status_code=400, detail="Item missing income ledger")
            income_totals[item.income_ledger_id] = income_totals.get(item.income_ledger_id, 0.0) + subtotal

        if output_tax_ledger_id is not None:
            header_tax_total += tax
        else:
            if not item.output_tax_ledger_id:
                raise HTTPException(status_code=400, detail="Item missing output tax ledger")
            tax_totals[item.output_tax_ledger_id] = tax_totals.get(item.output_tax_ledger_id, 0.0) + tax

    payment_mode: models.PaymentMode | None = None
    if payment_mode_id is not None:
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
            raise HTTPException(status_code=400, detail="Invalid payment_mode_id")

    is_credit_mode = bool(
        payment_mode is not None and payment_mode.name.strip().lower() == "credit"
    )

    # Always book the receivable to the customer ledger.
    counterparty_ledger_id = customer.ledger_id

    db.add(
        models.VoucherLine(
            voucher_id=voucher.id,
            ledger_id=counterparty_ledger_id,
            debit=grand_total,
            credit=0,
        )
    )

    # If the invoice is marked as paid via a cash/bank payment mode, also record
    # the settlement leg so the cash/bank ledger is affected and the customer
    # ledger shows both the invoice and the receipt.
    if payment_mode is not None and not is_credit_mode:
        db.add(
            models.VoucherLine(
                voucher_id=voucher.id,
                ledger_id=counterparty_ledger_id,
                debit=0,
                credit=grand_total,
            )
        )
        eff_pm_ledger_id = payment_ledger_id or payment_mode.ledger_id
        db.add(
            models.VoucherLine(
                voucher_id=voucher.id,
                ledger_id=eff_pm_ledger_id,
                debit=grand_total,
                credit=0,
            )
        )
        db.add(
            models.VoucherAllocation(
                company_id=company_id,
                voucher_id=voucher.id,
                doc_type=models.AllocationDocType.SALES_INVOICE.value,
                doc_id=invoice.id,
                allocated_amount=grand_total,
            )
        )

    if sales_ledger_id is not None and header_income_total:
        db.add(
            models.VoucherLine(
                voucher_id=voucher.id,
                ledger_id=sales_ledger_id,
                debit=0,
                credit=header_income_total,
            )
        )
    else:
        for ledger_id, amount in income_totals.items():
            db.add(
                models.VoucherLine(
                    voucher_id=voucher.id,
                    ledger_id=ledger_id,
                    debit=0,
                    credit=amount,
                )
            )

    if output_tax_ledger_id is not None and header_tax_total:
        db.add(
            models.VoucherLine(
                voucher_id=voucher.id,
                ledger_id=output_tax_ledger_id,
                debit=0,
                credit=header_tax_total,
            )
        )
    else:
        for ledger_id, amount in tax_totals.items():
            db.add(
                models.VoucherLine(
                    voucher_id=voucher.id,
                    ledger_id=ledger_id,
                    debit=0,
                    credit=amount,
                )
            )

    if cogs_total:
        cogs_ledger_id = _get_default_cogs_ledger_id(db, company_id=company_id)
        stock_ledger_id = _get_default_stock_ledger_id(db, company_id=company_id)

        if cogs_ledger_id is None:
            raise HTTPException(
                status_code=400,
                detail="COGS ledger not found and could not be created (missing 'Direct Expenses' group).",
            )
        if stock_ledger_id is None:
            raise HTTPException(
                status_code=400,
                detail="Stock/Inventory ledger not found and could not be created (missing 'Stock-in-Hand' group).",
            )

        db.add(
            models.VoucherLine(
                voucher_id=voucher.id,
                ledger_id=cogs_ledger_id,
                debit=cogs_total,
                credit=0,
            )
        )
        db.add(
            models.VoucherLine(
                voucher_id=voucher.id,
                ledger_id=stock_ledger_id,
                debit=0,
                credit=cogs_total,
            )
        )

    # ── Incentive Postings ───────────────────────────────────────────
    # For invoices, we also need to book incentives if they exist
    incentives = db.query(models.SalesInvoiceIncentive).filter(
        models.SalesInvoiceIncentive.invoice_id == invoice.id,
        models.SalesInvoiceIncentive.company_id == company_id
    ).all()

    if incentives:
        company = db.query(models.Company).filter(models.Company.id == company_id).first()
        default_expense_ledger_id = company.default_incentive_expense_ledger_id if company else None
        default_payable_ledger_id = getattr(company, "default_incentive_payable_ledger_id", None)
        
        # If no payable ledger is configured, we try to find one named "Sales Incentive Payable"
        if default_payable_ledger_id is None:
            payable_ledger = db.query(models.Ledger).filter(
                models.Ledger.company_id == company_id,
                models.Ledger.name == "Sales Incentive Payable"
            ).first()
            if payable_ledger:
                default_payable_ledger_id = payable_ledger.id

        if default_payable_ledger_id:
            rules = db.query(models.IncentiveRule).filter(
                models.IncentiveRule.company_id == company_id,
                models.IncentiveRule.is_active == True
            ).all()

            for inc in incentives:
                if not inc.incentive_amount:
                    continue
                
                # Resolve Expense Ledger
                expense_ledger_id = None
                for r in rules:
                    if r.sales_person_id == inc.sales_person_id:
                        if r.ledger_id:
                            expense_ledger_id = r.ledger_id
                            break
                
                if expense_ledger_id is None:
                    expense_ledger_id = default_expense_ledger_id
                
                if expense_ledger_id:
                    # DR Expense
                    db.add(
                        models.VoucherLine(
                            voucher_id=voucher.id,
                            ledger_id=expense_ledger_id,
                            debit=inc.incentive_amount,
                            credit=0,
                        )
                    )
                    # CR Payable
                    db.add(
                        models.VoucherLine(
                            voucher_id=voucher.id,
                            ledger_id=default_payable_ledger_id,
                            debit=0,
                            credit=inc.incentive_amount,
                        )
                    )
