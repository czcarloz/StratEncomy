from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    tenant_id: int | None
    action: str
    entity: str | None
    entity_id: int | None
    payload_json: dict | None
    ip: str | None
    ts: datetime

    model_config = {"from_attributes": True}
