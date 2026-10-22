"""Pydantic schemas for CallActivityEntry."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class CallEntryBase(BaseModel):
    lead_category: str = Field(..., max_length=100)
    till_today_status: Optional[int] = Field(None, ge=0)
    slot_10am_1pm: Optional[int] = Field(None, ge=0)
    slot_2pm_5pm: Optional[int] = Field(None, ge=0)
    slot_5pm_6pm: Optional[int] = Field(None, ge=0)
    total_dialed: Optional[int] = Field(None, ge=0)
    total_connected: Optional[int] = Field(None, ge=0)
    total_duration_minutes: Optional[int] = Field(None, ge=0)
    lead_status_hp: Optional[int] = Field(None, ge=0)
    lead_status_p: Optional[int] = Field(None, ge=0)
    lead_status_fub: Optional[int] = Field(None, ge=0)
    lead_status_ni: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None


class CallEntryRead(CallEntryBase):
    id: int
    report_id: int

    model_config = {"from_attributes": True}


class CallEntriesUpsert(BaseModel):
    """Upsert the full set of call entries for a report in one request."""
    entries: List[CallEntryBase]


class CallEntriesRead(BaseModel):
    report_id: int
    entries: List[CallEntryRead]
