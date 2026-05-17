"""
Run once to populate the database with initial data:
  docker exec stratencomy-backend-1 python -m app.db.seed
"""

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import Tenant, User, UserRole, UserTenantAccess


async def seed() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as db:
        async with db.begin():
            await _seed(db)

    await engine.dispose()
    print("Seed completed successfully.")


async def _seed(db: AsyncSession) -> None:
    # Admin user
    admin = User(
        email="admin@stratencomy.com",
        password_hash=hash_password("Admin@1234"),
        role=UserRole.admin,
    )
    db.add(admin)
    await db.flush()

    # Test tenant
    tenant = Tenant(name="Demo Tenant", owner_user_id=admin.id)
    db.add(tenant)
    await db.flush()

    db.add(UserTenantAccess(user_id=admin.id, tenant_id=tenant.id, role=UserRole.admin))

    # Client user
    client = User(
        email="client@stratencomy.com",
        password_hash=hash_password("Client@1234"),
        role=UserRole.client,
    )
    db.add(client)
    await db.flush()

    db.add(UserTenantAccess(user_id=client.id, tenant_id=tenant.id, role=UserRole.client))

    print(f"Admin:  admin@stratencomy.com  / Admin@1234")
    print(f"Client: client@stratencomy.com / Client@1234")
    print(f"Tenant: {tenant.name} (id={tenant.id})")


if __name__ == "__main__":
    asyncio.run(seed())
