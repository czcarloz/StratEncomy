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


@pytest.mark.asyncio
async def test_list_categories_unauthenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.get("/api/v1/categories", headers=HEADERS)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_create_and_list_category():
    token = await _admin_token()
    auth = {"Authorization": f"Bearer {token}", **HEADERS}

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.post("/api/v1/categories", json={
            "name": "Groceries",
            "type": "expense",
            "color": "#FF5733",
        }, headers=auth)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Groceries"
    assert data["tenant_id"] == 1

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.get("/api/v1/categories", headers=auth)
    assert r.status_code == 200
    names = [c["name"] for c in r.json()]
    assert "Groceries" in names


@pytest.mark.asyncio
async def test_create_category_invalid_color():
    token = await _admin_token()
    auth = {"Authorization": f"Bearer {token}", **HEADERS}

    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        r = await c.post("/api/v1/categories", json={
            "name": "Bad Color",
            "type": "expense",
            "color": "red",
        }, headers=auth)
    assert r.status_code == 422
