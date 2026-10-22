"""Pydantic schemas for MeetingActivityEntry."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class MeetingEntryBase(BaseModel):
    activity_type: str = Field(..., max_length=100)
    till_today_value: Optional[int] = Field(None, ge=0)
    slot_10am_1pm: Optional[int] = Field(None, ge=0)
    slot_2pm_5pm: Optional[int] = Field(None, ge=0)
    slot_5pm_6pm: Optional[int] = Field(None, ge=0)
    total_count: Optional[int] = Field(None, ge=0)
    total_duration_minutes: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None


class MeetingEntryRead(MeetingEntryBase):
    id: int
    report_id: int

    model_config = {"from_attributes": True}


class MeetingEntriesUpsert(BaseModel):
    """Upsert the full set of meeting entries for a report in one request."""
    entries: List[MeetingEntryBase]


class MeetingEntriesRead(BaseModel):
    report_id: int
    entries: List[MeetingEntryRead]
