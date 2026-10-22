"""Pydantic schemas for AppSettings (configurable business labels)."""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class SettingRead(BaseModel):
    id: int
    namespace: str
    key: str
    value: str
    description: Optional[str] = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class SettingUpsert(BaseModel):
    """Upsert a single setting by namespace + key."""
    namespace: str = Field(..., max_length=100)
    key: str = Field(..., max_length=200)
    value: str
    description: Optional[str] = None


class NamespaceSettings(BaseModel):
    """All settings under a given namespace."""
    namespace: str
    settings: Dict[str, str]  # key -> value


class AllSettings(BaseModel):
    """Full settings dump organized by namespace."""
    namespaces: Dict[str, Dict[str, str]]
