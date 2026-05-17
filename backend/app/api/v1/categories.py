from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DB, TenantID
from app.models.transaction import Category
from app.schemas.transaction import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
async def list_categories(db: DB, tenant_id: TenantID):
    result = await db.scalars(
        select(Category).where(Category.tenant_id == tenant_id).order_by(Category.name)
    )
    return result.all()


@router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, db: DB, tenant_id: TenantID):
    category = Category(**body.model_dump(), tenant_id=tenant_id)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.put("/{category_id}", response_model=CategoryRead)
async def update_category(category_id: int, body: CategoryUpdate, db: DB, tenant_id: TenantID):
    category = await _get_or_404(db, category_id, tenant_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: int, db: DB, tenant_id: TenantID):
    category = await _get_or_404(db, category_id, tenant_id)
    await db.delete(category)
    await db.commit()


async def _get_or_404(db, category_id: int, tenant_id: int) -> Category:
    category = await db.scalar(
        select(Category).where(Category.id == category_id, Category.tenant_id == tenant_id)
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category
