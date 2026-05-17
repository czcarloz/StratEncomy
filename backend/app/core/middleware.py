from jose import JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.security import decode_token


class TenantMiddleware(BaseHTTPMiddleware):
    """Extracts tenant_id from the JWT access token and stores it in request.state."""

    async def dispatch(self, request: Request, call_next):
        request.state.tenant_id = None
        request.state.user_id = None
        request.state.role = None

        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
            try:
                payload = decode_token(token)
                if payload.get("type") == "access":
                    request.state.user_id = int(payload["sub"])
                    request.state.role = payload.get("role")
                    request.state.tenant_id = payload.get("tenant_id")
            except (JWTError, KeyError, ValueError):
                pass

        return await call_next(request)
