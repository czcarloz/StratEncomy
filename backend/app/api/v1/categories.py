from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.deps import CurrentUser, DB, TenantID
from app.models.transaction import Category
from app.schemas.transaction import CategoryCreate, CategoryRead, CategoryUpdate
from app.services.audit import client_ip, log as audit

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
async def list_categories(db: DB, tenant_id: TenantID):
    result = await db.scalars(
        select(Category).where(Category.tenant_id == tenant_id).order_by(Category.name)
    )
    return result.all()


@router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(request: Request, body: CategoryCreate, db: DB, tenant_id: TenantID, user: CurrentUser):
    category = Category(**body.model_dump(), tenant_id=tenant_id)
    db.add(category)
    await db.flush()
    await audit(db, "category.create", user_id=user.id, tenant_id=tenant_id,
                entity="category", entity_id=category.id,
                payload={"name": body.name, "type": body.type}, ip=client_ip(request))
    await db.commit()
    await db.refresh(category)
    return category


@router.put("/{category_id}", response_model=CategoryRead)
async def update_category(request: Request, category_id: int, body: CategoryUpdate, db: DB, tenant_id: TenantID, user: CurrentUser):
    category = await _get_or_404(db, category_id, tenant_id)
    old_name = category.name
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(category, field, value)
    await audit(db, "category.update", user_id=user.id, tenant_id=tenant_id,
                entity="category", entity_id=category_id,
                payload={"old_name": old_name, "new_name": category.name}, ip=client_ip(request))
    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(request: Request, category_id: int, db: DB, tenant_id: TenantID, user: CurrentUser):
    category = await _get_or_404(db, category_id, tenant_id)
    await audit(db, "category.delete", user_id=user.id, tenant_id=tenant_id,
                entity="category", entity_id=category_id,
                payload={"name": category.name}, ip=client_ip(request))
    await db.delete(category)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This category is in use by one or more transactions and cannot be deleted.",
        )


async def _get_or_404(db, category_id: int, tenant_id: int) -> Category:
    category = await db.scalar(
        select(Category).where(Category.id == category_id, Category.tenant_id == tenant_id)
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category
