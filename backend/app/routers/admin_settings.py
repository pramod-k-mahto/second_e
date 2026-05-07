from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_admin
from ..menu_defaults import ensure_menu_template_assignable_to_tenant
from ..database import get_db

router = APIRouter(
    prefix="/admin/settings",
    tags=["Admin Settings"],
    dependencies=[Depends(get_current_admin)],
)


def get_or_create_settings(db: Session) -> models.AppSettings:
    settings = db.query(models.AppSettings).filter(models.AppSettings.id == 1).first()
    if not settings:
        settings = models.AppSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=schemas.AppSettingsRead)
def read_settings(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    settings = get_or_create_settings(db)
    return settings


@router.put("", response_model=schemas.AppSettingsRead)
def update_settings(
    payload: schemas.AppSettingsUpdate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    settings = get_or_create_settings(db)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return settings


@router.get("/business-types", response_model=list[schemas.BusinessTypeRead])
def list_business_types(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """List all business types with their features."""
    return db.query(models.BusinessType).order_by(models.BusinessType.name).all()


@router.post("/business-types", response_model=schemas.BusinessTypeRead)
def create_business_type(
    type_in: schemas.BusinessTypeCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Create a new business type."""
    existing = db.query(models.BusinessType).filter(models.BusinessType.code == type_in.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Business type code already exists")

    if type_in.default_menu_template_id is not None:
        tpl = db.query(models.MenuTemplate).get(int(type_in.default_menu_template_id))
        ensure_menu_template_assignable_to_tenant(tpl)

    obj = models.BusinessType(**type_in.model_dump())
    obj.code = obj.code.upper()
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/business-types/{type_id}", response_model=schemas.BusinessTypeRead)
def update_business_type(
    type_id: int,
    type_in: schemas.BusinessTypeUpdate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Update a business type."""
    obj = db.query(models.BusinessType).get(type_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Business type not found")
    
    update_data = type_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "code":
            value = value.upper()
        setattr(obj, field, value)
    
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/business-types/{type_id}")
def delete_business_type(
    type_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Delete a business type."""
    obj = db.query(models.BusinessType).get(type_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Business type not found")
    
    db.delete(obj)
    db.commit()
    return {"detail": "Business type deleted"}


# Business Type Features CRUD

@router.post("/business-types/{type_id}/features", response_model=schemas.BusinessTypeFeatureRead)
def upsert_business_type_feature(
    type_id: int,
    feature_in: schemas.BusinessTypeFeatureCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Enable/disable a feature for a business type."""
    feature = db.query(models.BusinessTypeFeature).filter(
        models.BusinessTypeFeature.business_type_id == type_id,
        models.BusinessTypeFeature.feature_code == feature_in.feature_code
    ).first()

    if feature:
        feature.is_enabled = feature_in.is_enabled
        if feature_in.config is not None:
            feature.config = feature_in.config
    else:
        feature = models.BusinessTypeFeature(
            business_type_id=type_id,
            **feature_in.model_dump()
        )
        db.add(feature)
    
    db.commit()
    db.refresh(feature)
    return feature


@router.get("/item-fields", response_model=list[schemas.ItemFieldConfigRead])
def list_item_field_configs(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """List all item field configurations across all business types."""
    return db.query(models.ItemFieldConfig).order_by(
        models.ItemFieldConfig.business_type,
        models.ItemFieldConfig.sort_order
    ).all()


@router.post("/item-fields", response_model=schemas.ItemFieldConfigRead)
def upsert_item_field_config(
    config_in: schemas.ItemFieldConfigCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Create or update an item field configuration."""
    config = db.query(models.ItemFieldConfig).filter(
        models.ItemFieldConfig.business_type == config_in.business_type,
        models.ItemFieldConfig.field_code == config_in.field_code
    ).first()

    if config:
        for field, value in config_in.model_dump().items():
            setattr(config, field, value)
    else:
        config = models.ItemFieldConfig(**config_in.model_dump())
        db.add(config)
    
    db.commit()
    db.refresh(config)
    return config


@router.post("/item-fields/clone")
def clone_item_field_configs(
    clone_in: schemas.ItemFieldCloneRequest,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Clone specific item field configurations from one industry to another."""
    # 1. Fetch source fields
    sources = db.query(models.ItemFieldConfig).filter(
        models.ItemFieldConfig.id.in_(clone_in.field_ids),
        models.ItemFieldConfig.business_type == clone_in.source_business_type
    ).all()

    if not sources:
        raise HTTPException(status_code=400, detail="No source fields found with specified IDs and industry.")

    # 2. Duplicate to target
    count = 0
    for src in sources:
        # Check if exists in target
        existing = db.query(models.ItemFieldConfig).filter(
            models.ItemFieldConfig.business_type == clone_in.target_business_type,
            models.ItemFieldConfig.field_code == src.field_code
        ).first()

        if existing:
            # Update existing
            existing.display_label = src.display_label
            existing.is_active = src.is_active
            existing.is_required = src.is_required
            existing.group_name = src.group_name
            existing.sort_order = src.sort_order
        else:
            # Create new
            new_cfg = models.ItemFieldConfig(
                business_type=clone_in.target_business_type,
                field_code=src.field_code,
                display_label=src.display_label,
                is_active=src.is_active,
                is_required=src.is_required,
                group_name=src.group_name,
                sort_order=src.sort_order
            )
            db.add(new_cfg)
        count += 1

    db.commit()
    return {"detail": f"Successfully deployed {count} fields to {clone_in.target_business_type}"}


@router.delete("/item-fields/{config_id}")
def delete_item_field_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    """Delete an item field configuration."""
    config = db.query(models.ItemFieldConfig).get(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    db.delete(config)
    db.commit()
    return {"detail": "Configuration deleted"}