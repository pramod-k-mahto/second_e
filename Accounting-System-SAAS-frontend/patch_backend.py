import sys
import re

SCHEMA_FILE = r'd:\Accounting System\API\backend\app\schemas.py'
ROUTER_FILE = r'd:\Accounting System\API\backend\app\routers\production.py'

# 1. Update schemas.py
schemas = open(SCHEMA_FILE, 'r').read()
if 'class ProductionOrderUpdate' not in schemas:
    schema_code = """
class ProductionOrderUpdate(BaseModel):
    product_id: Optional[int] = None
    quantity: Optional[float] = None
    order_date: Optional[date] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    supervisor_name: Optional[str] = None
    expected_completion_date: Optional[date] = None
"""
    # Append right after ProductionOrderCreate
    schemas = schemas.replace('class ProductionOrderRead(BaseModel):', schema_code + '\nclass ProductionOrderRead(BaseModel):')
    with open(SCHEMA_FILE, 'w') as f:
        f.write(schemas)
    print("Patched schemas.py")

# 2. Update production.py
router = open(ROUTER_FILE, 'r').read()
if 'def update_production_order(' not in router:
    router_code = """
@router.put("/production-orders/{production_order_id}", response_model=schemas.ProductionOrderRead)
def update_production_order(
    company_id: int,
    production_order_id: int,
    data: schemas.ProductionOrderUpdate,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
):
    require_menu_access(current_user, "Manufacturing", "write")
    order = (
        db.query(models.ProductionOrder)
        .filter(
            models.ProductionOrder.company_id == company_id,
            models.ProductionOrder.id == production_order_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Cannot update completed or cancelled orders")

    update_data = data.dict(exclude_unset=True)
    for k, v in update_data.items():
        setattr(order, k, v)
    
    db.commit()
    db.refresh(order)
    return order

@router.delete("/production-orders/{production_order_id}", status_code=204)
def delete_production_order(
    company_id: int,
    production_order_id: int,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
):
    require_menu_access(current_user, "Manufacturing", "write")
    order = (
        db.query(models.ProductionOrder)
        .filter(
            models.ProductionOrder.company_id == company_id,
            models.ProductionOrder.id == production_order_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order.status not in ("DRAFT",):
        raise HTTPException(status_code=400, detail="Only DRAFT orders can be deleted")
        
    # Delete related ProductionItems first (if they exist)
    db.query(models.ProductionItem).filter(models.ProductionItem.production_order_id == order.id).delete()
    
    db.delete(order)
    db.commit()
    return None
"""
    # Append to the end of the file or after get_production_order
    router += "\n" + router_code
    with open(ROUTER_FILE, 'w') as f:
        f.write(router)
    print("Patched production.py")
