"""Writes audit log entries within the caller's DB session/transaction."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def log(
    db: AsyncSession,
    action: str,
    *,
    user_id: int | None = None,
    tenant_id: int | None = None,
    entity: str | None = None,
    entity_id: int | None = None,
    payload: dict | None = None,
    ip: str | None = None,
) -> None:
    """Add an AuditLog row to the session. Committed by the caller."""
    db.add(AuditLog(
        user_id=user_id,
        tenant_id=tenant_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        payload_json=payload,
        ip=ip,
    ))


def client_ip(request) -> str | None:
    """Extract real client IP, respecting X-Forwarded-For."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
