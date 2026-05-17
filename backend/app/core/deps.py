from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User, UserRole, UserTenantAccess

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exc
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise credentials_exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_exc
    return user


async def get_admin_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


async def get_tenant_id(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    x_tenant_id: Annotated[int | None, Header()] = None,
) -> int:
    """
    Resolves the active tenant for the request.
    Priority: JWT claim → X-Tenant-ID header.
    Validates that the user has access to the tenant (admin bypasses this check).
    """
    tenant_id = request.state.tenant_id or x_tenant_id

    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant ID required: pass X-Tenant-ID header",
        )

    if current_user.role == UserRole.admin:
        return tenant_id

    access = await db.scalar(
        select(UserTenantAccess).where(
            UserTenantAccess.user_id == current_user.id,
            UserTenantAccess.tenant_id == tenant_id,
        )
    )
    if not access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this tenant")

    return tenant_id


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(get_admin_user)]
DB = Annotated[AsyncSession, Depends(get_db)]
TenantID = Annotated[int, Depends(get_tenant_id)]
