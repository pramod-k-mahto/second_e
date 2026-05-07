from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_admin, get_current_superadmin, get_tech_admin
from ..menu_defaults import (
    _default_group_for_menu_code,
    ensure_menu_template_has_required_menus,
    required_menu_codes_after_template_edit,
    user_can_view_superadmin_menu_templates,
)

router = APIRouter(
    prefix="/admin/menu-templates",
    tags=["admin-menu-templates"],
    dependencies=[Depends(get_current_admin)],
)


def _template_dto(db: Session, t: models.MenuTemplate) -> schemas.MenuTemplateRead:
    items_query = (
        db.query(
            models.MenuTemplateMenu,
            models.Menu.label,
            models.Menu.code
        )
        .join(models.Menu, models.Menu.id == models.MenuTemplateMenu.menu_id)
        .filter(models.MenuTemplateMenu.template_id == int(t.id))
        .all()
    )
    
    items = []
    menu_ids = []
    for row in items_query:
        rel = row[0]
        label = row[1]
        code = row[2]
        
        mid = int(rel.menu_id)
        menu_ids.append(mid)
        items.append(schemas.MenuTemplateMenuItemRead(
            menu_id=mid,
            group_name=rel.group_name,
            group_order=rel.group_order,
            item_order=rel.item_order,
            parent_id=rel.parent_id,
            label=label,
            code=code,
            is_sidebar_visible=rel.is_sidebar_visible
        ))

    return schemas.MenuTemplateRead(
        id=int(t.id),
        name=str(t.name),
        description=getattr(t, "description", None),
        is_active=bool(getattr(t, "is_active", True)),
        superadmin_only=bool(getattr(t, "superadmin_only", False)),
        created_at=t.created_at,
        menu_ids=sorted(menu_ids),
        items=items
    )


def _validate_menu_ids(db: Session, menu_ids: list[int]) -> list[int]:
    normalized = sorted({int(x) for x in (menu_ids or []) if x is not None})
    if not normalized:
        return []

    menus = db.query(models.Menu.id).filter(models.Menu.id.in_(normalized)).all()
    found = {int(m[0]) for m in menus}
    missing = [i for i in normalized if i not in found]
    if missing:
        raise HTTPException(status_code=400, detail="Invalid menu_ids")
    return normalized


@router.get("/dropdown", response_model=List[schemas.MenuTemplateDropdownRead])
def list_menu_templates_dropdown(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    query = db.query(models.MenuTemplate)
    if not include_inactive:
        query = query.filter(models.MenuTemplate.is_active.is_(True))

    if not user_can_view_superadmin_menu_templates(current_user):
        query = query.filter(models.MenuTemplate.superadmin_only.is_(False))
    templates = query.order_by(models.MenuTemplate.name.asc(), models.MenuTemplate.id.asc()).all()

    result: list[schemas.MenuTemplateDropdownRead] = []
    for t in templates:
        modules = (
            db.query(models.Menu.module)
            .join(models.MenuTemplateMenu, models.MenuTemplateMenu.menu_id == models.Menu.id)
            .filter(models.MenuTemplateMenu.template_id == int(t.id))
            .all()
        )
        module_set = {str(m[0]).strip() for m in modules if m and m[0] is not None and str(m[0]).strip()}
        modules_str = ", ".join(sorted(module_set, key=lambda x: x.casefold()))
        result.append(
            schemas.MenuTemplateDropdownRead(
                id=int(t.id),
                name=str(t.name),
                modules=modules_str,
            )
        )
    return result


@router.get("", response_model=List[schemas.MenuTemplateRead])
def list_menu_templates(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    query = db.query(models.MenuTemplate)
    if not include_inactive:
        query = query.filter(models.MenuTemplate.is_active.is_(True))
    if not user_can_view_superadmin_menu_templates(current_user):
        query = query.filter(models.MenuTemplate.superadmin_only.is_(False))
    templates = query.order_by(models.MenuTemplate.name.asc(), models.MenuTemplate.id.asc()).all()
    return [_template_dto(db, t) for t in templates]


@router.get("/{template_id}", response_model=schemas.MenuTemplateRead)
def get_menu_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    t = db.query(models.MenuTemplate).get(template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if bool(getattr(t, "superadmin_only", False)) and not user_can_view_superadmin_menu_templates(current_user):
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_dto(db, t)


@router.post("", response_model=schemas.MenuTemplateRead, status_code=201)
def create_menu_template(
    payload: schemas.MenuTemplateCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_tech_admin),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    existing = db.query(models.MenuTemplate).filter(models.MenuTemplate.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Template name already exists")

    t = models.MenuTemplate(
        name=name,
        description=payload.description,
        is_active=bool(payload.is_active),
        superadmin_only=False,
    )
    db.add(t)
    db.flush()

    # Case 1: Manual configuration provided in 'items'
    if payload.items:
        for item in payload.items:
            mid = int(item.menu_id)
            menu_obj = db.query(models.Menu).get(mid)
            if not menu_obj:
                continue
            
            # Use provided values, fallback to defaults if null
            default_gn, default_go = _default_group_for_menu_code(menu_obj.code)
            gn = item.group_name if item.group_name is not None else default_gn
            go = item.group_order if item.group_order is not None else default_go
            io = item.item_order if item.item_order is not None else (int(getattr(menu_obj, "sort_order", 0) or 0) or None)

            db.add(models.MenuTemplateMenu(
                template_id=int(t.id),
                menu_id=mid,
                group_name=gn,
                group_order=go,
                item_order=io,
                parent_id=item.parent_id,
                is_sidebar_visible=item.is_sidebar_visible,
            ))
    # Case 2: Legacy 'menu_ids' fallback
    else:
        menu_ids = _validate_menu_ids(db, payload.menu_ids or [])
        for mid in menu_ids:
            menu_obj = db.query(models.Menu).get(int(mid))
            if not menu_obj:
                continue
            gn, go = _default_group_for_menu_code(menu_obj.code)
            db.add(models.MenuTemplateMenu(
                template_id=int(t.id),
                menu_id=int(mid),
                group_name=gn,
                group_order=go,
                item_order=int(getattr(menu_obj, "sort_order", 0) or 0) or None,
            ))

    db.commit()
    db.refresh(t)

    # After commit, ensure essential menus are present
    ensure_menu_template_has_required_menus(
        db,
        template_id=int(t.id),
        required_menu_codes=required_menu_codes_after_template_edit(t),
    )
    db.refresh(t)
    
    return _template_dto(db, t)


@router.put("/{template_id}", response_model=schemas.MenuTemplateRead)
def update_menu_template(
    template_id: int,
    payload: schemas.MenuTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_tech_admin),
):
    t = db.query(models.MenuTemplate).get(template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if bool(getattr(t, "superadmin_only", False)) and not user_can_view_superadmin_menu_templates(current_user):
        raise HTTPException(status_code=404, detail="Template not found")

    data = payload.model_dump(exclude_unset=True)

    menu_ids: list[int] | None = None
    if "menu_ids" in data and data["menu_ids"] is not None:
        menu_ids = _validate_menu_ids(db, data["menu_ids"])

    if "name" in data and data["name"] is not None:
        name = str(data["name"]).strip()
        if not name:
            raise HTTPException(status_code=400, detail="name is required")
        existing = (
            db.query(models.MenuTemplate)
            .filter(models.MenuTemplate.name == name, models.MenuTemplate.id != int(template_id))
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Template name already exists")
        t.name = name

    if "description" in data:
        t.description = data.get("description")

    if "is_active" in data and data["is_active"] is not None:
        t.is_active = bool(data["is_active"])

    db.add(t)

    if ("menu_ids" in data and data["menu_ids"] is not None) or ("items" in data and data["items"] is not None):
        db.query(models.MenuTemplateMenu).filter(
            models.MenuTemplateMenu.template_id == int(t.id)
        ).delete(synchronize_session=False)
        
        # Case 1: Manual configuration provided in 'items'
        if payload.items is not None:
            for item in payload.items:
                mid = int(item.menu_id)
                menu_obj = db.query(models.Menu).get(mid)
                if not menu_obj:
                    continue
                
                # Use provided values, fallback to defaults if null
                default_gn, default_go = _default_group_for_menu_code(menu_obj.code)
                gn = item.group_name if item.group_name is not None else default_gn
                go = item.group_order if item.group_order is not None else default_go
                io = item.item_order if item.item_order is not None else (int(getattr(menu_obj, "sort_order", 0) or 0) or None)

                db.add(models.MenuTemplateMenu(
                    template_id=int(t.id),
                    menu_id=mid,
                    group_name=gn,
                    group_order=go,
                    item_order=io,
                    parent_id=item.parent_id,
                    is_sidebar_visible=item.is_sidebar_visible,
                ))
        # Case 2: Legacy 'menu_ids' fallback
        elif payload.menu_ids is not None:
            menu_ids = _validate_menu_ids(db, payload.menu_ids)
            for mid in menu_ids:
                menu_obj = db.query(models.Menu).get(int(mid))
                if not menu_obj:
                    continue
                gn, go = _default_group_for_menu_code(menu_obj.code)
                db.add(models.MenuTemplateMenu(
                    template_id=int(t.id),
                    menu_id=int(mid),
                    group_name=gn,
                    group_order=go,
                    item_order=int(getattr(menu_obj, "sort_order", 0) or 0) or None,
                ))

    db.commit()
    db.refresh(t)

    # After commit, ensure essential menus are present
    ensure_menu_template_has_required_menus(
        db,
        template_id=int(t.id),
        required_menu_codes=required_menu_codes_after_template_edit(t),
    )
    db.refresh(t)

    return _template_dto(db, t)


@router.delete("/{template_id}", status_code=204)
def delete_menu_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_tech_admin),
):
    t = db.query(models.MenuTemplate).get(template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if bool(getattr(t, "superadmin_only", False)):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the seeded superadmin reference menu template.",
        )

    # Safeguard: Check if template is assigned to any tenant or plan
    tenant_usage = db.query(models.Tenant).filter(models.Tenant.menu_template_id == template_id).all()
    plan_usage = db.query(models.Plan).filter(models.Plan.menu_template_id == template_id).all()
    
    usage_list = []
    if tenant_usage:
        usage_list.append(f"{len(tenant_usage)} tenants")
    if plan_usage:
        usage_list.append(f"{len(plan_usage)} plans")
        
    if usage_list:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete '{t.name}'. It is currently assigned to {' and '.join(usage_list)}. Please unassign them first."
        )

    # Soft delete: mark as inactive
    t.is_active = False
    db.add(t)
    db.commit()
    return
