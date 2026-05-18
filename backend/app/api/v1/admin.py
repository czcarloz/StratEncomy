from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.deps import AdminUser, DB
from app.models.audit import AuditLog
from app.schemas.admin import AuditLogOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/audit-log", response_model=list[AuditLogOut])
async def list_audit_log(
    db: DB,
    _: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str | None = None,
    user_id: int | None = None,
    tenant_id: int | None = None,
):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if tenant_id:
        stmt = stmt.where(AuditLog.tenant_id == tenant_id)
    stmt = stmt.order_by(AuditLog.ts.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.scalars(stmt)
    return result.all()
