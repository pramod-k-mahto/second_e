from datetime import date
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user
from ..services import notification_service
from ..dependencies import get_company_secure

router = APIRouter(prefix="/companies/{company_id}/delivery", tags=["Delivery Management"])

def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)

# ----------------- Delivery Places -----------------

@router.get("/places", response_model=List[schemas.DeliveryPlaceResponse])
def get_delivery_places(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    places = db.query(models.DeliveryPlace).filter(models.DeliveryPlace.company_id == company_id).all()
    return places

@router.post("/places", response_model=schemas.DeliveryPlaceResponse, status_code=status.HTTP_201_CREATED)
def create_delivery_place(
    company_id: int,
    place_in: schemas.DeliveryPlaceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    db_place = models.DeliveryPlace(**place_in.model_dump(), company_id=company_id)
    db.add(db_place)
    try:
        db.commit()
        db.refresh(db_place)
        return db_place
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error creating delivery place.")

@router.put("/places/{place_id}", response_model=schemas.DeliveryPlaceResponse)
def update_delivery_place(
    company_id: int,
    place_id: int,
    place_in: dict, # Using dict for partial updates to accommodate frontend
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    db_place = db.query(models.DeliveryPlace).filter(models.DeliveryPlace.id == place_id, models.DeliveryPlace.company_id == company_id).first()
    if not db_place:
        raise HTTPException(status_code=404, detail="Delivery Place not found")
    
    for key, value in place_in.items():
        if hasattr(db_place, key):
            setattr(db_place, key, value)
            
    db.add(db_place)
    db.commit()
    db.refresh(db_place)
    return db_place

@router.delete("/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_delivery_place(
    company_id: int,
    place_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    db_place = db.query(models.DeliveryPlace).filter(models.DeliveryPlace.id == place_id, models.DeliveryPlace.company_id == company_id).first()
    if not db_place:
        raise HTTPException(status_code=404, detail="Delivery Place not found")
    
    in_use = db.query(models.Package).filter(models.Package.delivery_place_id == place_id, models.Package.company_id == company_id).first()
    if in_use:
        raise HTTPException(status_code=400, detail="Cannot delete place as it is linked to packages.")
        
    db.delete(db_place)
    db.commit()
    return None

# ----------------- Delivery Partners -----------------

@router.get("/partners", response_model=List[schemas.DeliveryPartnerResponse])
def get_delivery_partners(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    partners = db.query(models.DeliveryPartner).filter(models.DeliveryPartner.company_id == company_id).all()
    return partners

@router.post("/partners", response_model=schemas.DeliveryPartnerResponse, status_code=status.HTTP_201_CREATED)
def create_delivery_partner(
    company_id: int,
    partner_in: schemas.DeliveryPartnerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    # Auto-create Ledger for Delivery Partner (Sundry Debtors)
    sundry_debtors_group = db.query(models.LedgerGroup).filter(
        models.LedgerGroup.company_id == company_id,
        func.lower(models.LedgerGroup.name).like('%sundry%debto%')
    ).first()
    
    if not sundry_debtors_group:
         # Fallback to creating a new group or using a generic asset group
        sundry_debtors_group = models.LedgerGroup(
            company_id=company_id,
            name="Delivery Partners (Debtors)",
            group_type=models.LedgerGroupType.ASSET
        )
        db.add(sundry_debtors_group)
        db.commit()
        db.refresh(sundry_debtors_group)

    ledger = models.Ledger(
        company_id=company_id,
        group_id=sundry_debtors_group.id,
        name=f"Delivery Partner: {partner_in.name}",
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
        is_active=True
    )
    db.add(ledger)
    db.flush()

    db_partner = models.DeliveryPartner(
        **partner_in.model_dump(),
        company_id=company_id,
        ledger_id=ledger.id
    )
    db.add(db_partner)
    
    try:
        db.commit()
        db.refresh(db_partner)
        return db_partner
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error creating delivery partner.")

@router.put("/partners/{partner_id}", response_model=schemas.DeliveryPartnerResponse)
def update_delivery_partner(
    company_id: int,
    partner_id: int,
    partner_in: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    db_partner = db.query(models.DeliveryPartner).filter(models.DeliveryPartner.id == partner_id, models.DeliveryPartner.company_id == company_id).first()
    if not db_partner:
        raise HTTPException(status_code=404, detail="Delivery Partner not found")
        
    name_changed = False
    for key, value in partner_in.items():
        if hasattr(db_partner, key):
            if key == "name" and value != db_partner.name:
                name_changed = True
            setattr(db_partner, key, value)
            
    if name_changed:
        ledger = db.query(models.Ledger).filter(models.Ledger.id == db_partner.ledger_id).first()
        if ledger:
            ledger.name = f"Delivery Partner: {db_partner.name}"
            db.add(ledger)
            
    db.add(db_partner)
    db.commit()
    db.refresh(db_partner)
    return db_partner

@router.delete("/partners/{partner_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_delivery_partner(
    company_id: int,
    partner_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    db_partner = db.query(models.DeliveryPartner).filter(models.DeliveryPartner.id == partner_id, models.DeliveryPartner.company_id == company_id).first()
    if not db_partner:
        raise HTTPException(status_code=404, detail="Delivery Partner not found")
        
    in_use = db.query(models.Package).filter(models.Package.delivery_partner_id == partner_id, models.Package.company_id == company_id).first()
    if in_use:
        raise HTTPException(status_code=400, detail="Cannot delete partner as they have packages.")
        
    ledger = db.query(models.Ledger).filter(models.Ledger.id == db_partner.ledger_id).first()
    # Assuming standard soft delete isn't set up, we just try to delete if untouched
    try:
        if ledger:
            db.delete(ledger)
        db.delete(db_partner)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Cannot delete partner due to existing ledger transactions.")
    return None

# ----------------- Packages -----------------

@router.get("/packages", response_model=List[schemas.PackageResponse])
def get_packages(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    packages = db.query(models.Package).filter(models.Package.company_id == company_id).order_by(models.Package.id.desc()).all()
    return packages

@router.post("/packages", response_model=schemas.PackageResponse, status_code=status.HTTP_201_CREATED)
def create_package(
    company_id: int,
    pkg_in: schemas.PackageCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    # Verify invoice exists
    invoice = db.query(models.SalesInvoice).filter(models.SalesInvoice.id == pkg_in.invoice_id, models.SalesInvoice.company_id == company_id).first()
    if not invoice:
         raise HTTPException(status_code=404, detail="Invoice not found")
         
    # Check if a package already exists for this invoice (optional restriction)
    existing_pkg = db.query(models.Package).filter(models.Package.invoice_id == pkg_in.invoice_id, models.Package.company_id == company_id).first()
    if existing_pkg:
         raise HTTPException(status_code=400, detail="A package already exists for this invoice.")
         
    # If shipping charge is higher than 0, post it against the invoice in ledger logic later maybe? (Not needed for basic MVP)
    # The COD amount should ideally be the invoice total amount
    # Let's calculate total amount automatically for convenience if not provided fully
    invoice_total = sum(
        (line.quantity * line.rate * (1 - line.discount / 100)) * (1 + line.tax_rate / 100)
        for line in invoice.lines
    )
    
    shipping_charge = Decimal(str(pkg_in.shipping_charge or 0))
    cod_amount = Decimal(str(pkg_in.cod_amount)) if pkg_in.cod_amount > 0 else invoice_total + shipping_charge

    db_pkg = models.Package(
        **pkg_in.model_dump(exclude={"cod_amount", "status"}), 
        company_id=company_id,
        cod_amount=cod_amount,
        status=models.PackageStatus.DISPATCHED # Usually dispatched when created in this flow
    )
    db.add(db_pkg)
    try:
        db.commit()
        db.refresh(db_pkg)
        
        # Trigger notification for new package (dispatched)
        background_tasks.add_task(notification_service.notify_package_status, db, db_pkg.id)
        
        return db_pkg
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error creating package.")

@router.put("/packages/{package_id}", response_model=schemas.PackageResponse)
def update_package(
    company_id: int,
    package_id: int,
    pkg_in: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    db_pkg = db.query(models.Package).filter(models.Package.id == package_id, models.Package.company_id == company_id).first()
    if not db_pkg:
        raise HTTPException(status_code=404, detail="Package not found")
        
    for key, value in pkg_in.items():
        if hasattr(db_pkg, key):
            setattr(db_pkg, key, value)
            
    db.add(db_pkg)
    db.commit()
    db.refresh(db_pkg)
    
    # If status was updated, trigger notification
    if "status" in pkg_in:
        background_tasks.add_task(notification_service.notify_package_status, db, db_pkg.id)
        
    return db_pkg

@router.post("/packages/{package_id}/receive-cod", response_model=schemas.PackageResponse)
def receive_cod(
    company_id: int,
    package_id: int,
    req: schemas.PackageReceiveCOD,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    db_pkg = db.query(models.Package).filter(models.Package.id == package_id, models.Package.company_id == company_id).first()
    if not db_pkg:
        raise HTTPException(status_code=404, detail="Package not found")
        
    amount_decimal = Decimal(str(req.amount))
    if db_pkg.cod_amount < amount_decimal:
        raise HTTPException(status_code=400, detail="Received amount exceeds COD balance.")
        
    # Standard Cash/Bank Ledger (ideally we pick default cash ledger, for now we will find one)
    cash_ledger = db.query(models.Ledger).join(models.LedgerGroup).filter(
        models.Ledger.company_id == company_id,
        func.lower(models.Ledger.name).like('%cash%'),
        models.LedgerGroup.group_type == models.LedgerGroupType.ASSET
    ).first()
    if not cash_ledger:
         raise HTTPException(status_code=400, detail="No cash ledger found for COD receipt.")
    
    partner = db.query(models.DeliveryPartner).filter(models.DeliveryPartner.id == db_pkg.delivery_partner_id).first()
    
    # Create Receipt Voucher: Debit Cash, Credit Partner Ledger
    # Get standard sequence for receipts
    from ..voucher_service import get_next_voucher_number # imported here for simplicity
    voucher_number, fiscal_year, next_seq = get_next_voucher_number(
        db, company_id, models.VoucherType.RECEIPT, date.today()
    )

    voucher = models.Voucher(
        company_id=company_id,
        voucher_date=date.today(),
        voucher_type=models.VoucherType.RECEIPT,
        fiscal_year=fiscal_year,
        voucher_sequence=next_seq,
        voucher_number=voucher_number,
        narration=f"COD Received for Package TRK-{db_pkg.tracking_number or db_pkg.id} (Inv: {db_pkg.invoice_id})",
    )
    db.add(voucher)
    db.flush()
    
    # Debit Cash Account
    line1 = models.VoucherLine(
        voucher_id=voucher.id,
        ledger_id=cash_ledger.id,
        debit=amount_decimal,
        credit=0
    )
    # Credit Partner Ledger
    line2 = models.VoucherLine(
        voucher_id=voucher.id,
        ledger_id=partner.ledger_id,
        debit=0,
        credit=amount_decimal
    )
    db.add_all([line1, line2])
    
    # Deduct COD amount
    db_pkg.cod_amount -= amount_decimal
    if db_pkg.cod_amount == 0 and db_pkg.status != models.PackageStatus.DELIVERED:
        db_pkg.status = models.PackageStatus.DELIVERED
        
    db.commit()
    db.refresh(db_pkg)
    
    # Trigger notification for delivery if status is now DELIVERED
    if db_pkg.status == models.PackageStatus.DELIVERED:
        background_tasks.add_task(notification_service.notify_package_status, db, db_pkg.id)

    return db_pkg
