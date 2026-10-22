"""Pydantic schemas for MeetingActivityEntry."""
from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, Field, model_validator


class MeetingEntryBase(BaseModel):
    activity_type: str = Field(..., max_length=100)
    till_today_value: Optional[int] = Field(None, ge=0)
    slot_10am_1pm: Optional[int] = Field(None, ge=0)
    slot_2pm_5pm: Optional[int] = Field(None, ge=0)
    slot_5pm_6pm: Optional[int] = Field(None, ge=0)
    total_count: Optional[int] = Field(None, ge=0)
    total_duration_minutes: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def remap_frontend_keys(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "activity_type" not in data and "metric_type" in data:
                data["activity_type"] = data["metric_type"]
            if "till_today_value" not in data and "till_today" in data:
                data["till_today_value"] = data["till_today"]
            if "slot_10am_1pm" not in data and "slot_10_to_1" in data:
                data["slot_10am_1pm"] = data["slot_10_to_1"]
            if "slot_2pm_5pm" not in data and "slot_2_to_5" in data:
                data["slot_2pm_5pm"] = data["slot_2_to_5"]
            if "slot_5pm_6pm" not in data and "slot_5_to_6" in data:
                data["slot_5pm_6pm"] = data["slot_5_to_6"]
        return data


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
