from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from jose import JWTError
from sqlalchemy import select

from app.core.deps import AdminUser, CurrentUser, DB
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import RefreshToken, Tenant, User, UserRole, UserTenantAccess
from app.schemas.auth import (
    RefreshRequest,
    TenantCreate,
    TenantRead,
    TokenResponse,
    UserCreate,
    UserRead,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: DB, _: AdminUser):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole(body.role),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: UserCreate, db: DB):
    user = await db.scalar(select(User).where(User.email == body.email))

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.locked_until and user.locked_until > datetime.now(UTC):
        raise HTTPException(status_code=403, detail="Account temporarily locked")

    if not verify_password(body.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            from datetime import timedelta
            user.locked_until = datetime.now(UTC) + timedelta(minutes=15)
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user.failed_login_attempts = 0
    user.locked_until = None

    raw_refresh = create_refresh_token(user.id)
    from hashlib import sha256
    token_hash = sha256(raw_refresh.encode()).hexdigest()
    from datetime import timedelta
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    ))
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=raw_refresh,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: DB):
    credentials_exc = HTTPException(status_code=401, detail="Invalid or expired refresh token")
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise credentials_exc
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise credentials_exc

    from hashlib import sha256
    token_hash = sha256(body.refresh_token.encode()).hexdigest()
    stored = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked == False,  # noqa: E712
        )
    )
    if not stored or stored.expires_at < datetime.now(UTC):
        raise credentials_exc

    stored.revoked = True
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise credentials_exc

    raw_refresh = create_refresh_token(user.id)
    new_hash = sha256(raw_refresh.encode()).hexdigest()
    from datetime import timedelta
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=new_hash,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    ))
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=raw_refresh,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, db: DB):
    from hashlib import sha256
    token_hash = sha256(body.refresh_token.encode()).hexdigest()
    stored = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    if stored:
        stored.revoked = True
        await db.commit()


@router.get("/me", response_model=UserRead)
async def me(current_user: CurrentUser):
    return current_user


# --- Tenant management (admin only) ---

tenants_router = APIRouter(prefix="/tenants", tags=["tenants"])


@tenants_router.get("", response_model=list[TenantRead])
async def list_tenants(db: DB, _: AdminUser):
    result = await db.scalars(select(Tenant).where(Tenant.is_active == True))  # noqa: E712
    return result.all()


@tenants_router.post("", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
async def create_tenant(body: TenantCreate, db: DB, admin: AdminUser):
    tenant = Tenant(name=body.name, owner_user_id=admin.id)
    db.add(tenant)
    await db.flush()
    db.add(UserTenantAccess(user_id=admin.id, tenant_id=tenant.id, role=UserRole.admin))
    await db.commit()
    await db.refresh(tenant)
    return tenant


@tenants_router.get("/me", response_model=list[TenantRead])
async def my_tenants(db: DB, current_user: CurrentUser):
    if current_user.role == UserRole.admin:
        result = await db.scalars(select(Tenant).where(Tenant.is_active == True))  # noqa: E712
        return result.all()
    result = await db.scalars(
        select(Tenant)
        .join(UserTenantAccess, UserTenantAccess.tenant_id == Tenant.id)
        .where(UserTenantAccess.user_id == current_user.id, Tenant.is_active == True)  # noqa: E712
    )
    return result.all()
