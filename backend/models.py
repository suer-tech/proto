from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

class Participant(BaseModel):
    name: str
    role: Optional[str] = None
    email: Optional[str] = None

class ProtocolStatus(str, Enum):
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class ProtocolResponse(BaseModel):
    id: str
    status: ProtocolStatus
    protocol: Optional[dict] = None
    error: Optional[str] = None

class ProtocolTypeInfo(BaseModel):
    id: str
    name: str
    description: str
    external_service_id: str
    assistant_id: str



