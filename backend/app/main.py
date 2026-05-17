from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.middleware import TenantMiddleware
from app.api.v1.auth import router as auth_router, tenants_router

app = FastAPI(
    title=settings.APP_NAME,
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TenantMiddleware)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(tenants_router, prefix="/api/v1")


@app.get("/health", tags=["status"])
async def health_check():
    return {"status": "ok", "version": "0.2.0", "environment": settings.ENVIRONMENT}
