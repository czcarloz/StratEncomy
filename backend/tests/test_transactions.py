import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app

BASE = "http://test"
HEADERS = {"X-Tenant-ID": "1"}


async def _admin_token() -> str:
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.post("/api/v1/auth/login", json={
            "email": "admin@stratencomy.com",
            "password": "Admin@1234",
        })
    return r.json()["access_token"]


async def _ensure_category(token: str, name: str = "Test Cat") -> int:
    auth = {"Authorization": f"Bearer {token}", **HEADERS}
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.post("/api/v1/categories", json={"name": name, "type": "expense"}, headers=auth)
    return r.json()["id"]


@pytest.mark.asyncio
async def test_create_and_list_transaction():
    token = await _admin_token()
    cat_id = await _ensure_category(token, "Food")
    auth = {"Authorization": f"Bearer {token}", **HEADERS}

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.post("/api/v1/transactions", json={
            "category_id": cat_id,
            "type": "expense",
            "amount": "99.90",
            "description": "Supermarket",
            "date": "2026-05-01",
        }, headers=auth)
    assert r.status_code == 201
    tx = r.json()
    assert float(tx["amount"]) == 99.90
    assert tx["tenant_id"] == 1

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.get("/api/v1/transactions", params={"month": 5, "year": 2026}, headers=auth)
    assert r.status_code == 200
    assert any(t["id"] == tx["id"] for t in r.json())


@pytest.mark.asyncio
async def test_transaction_amount_must_be_positive():
    token = await _admin_token()
    cat_id = await _ensure_category(token, "Invalid Amount Cat")
    auth = {"Authorization": f"Bearer {token}", **HEADERS}

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.post("/api/v1/transactions", json={
            "category_id": cat_id,
            "type": "expense",
            "amount": "-10.00",
            "date": "2026-05-01",
        }, headers=auth)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_transaction_wrong_tenant_category():
    token = await _admin_token()
    auth = {"Authorization": f"Bearer {token}", **HEADERS}

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.post("/api/v1/transactions", json={
            "category_id": 99999,
            "type": "expense",
            "amount": "10.00",
            "date": "2026-05-01",
        }, headers=auth)
    assert r.status_code == 422
