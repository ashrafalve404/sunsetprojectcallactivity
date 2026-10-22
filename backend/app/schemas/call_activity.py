"""Pydantic schemas for CallActivityEntry."""
from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, Field, model_validator


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

    @model_validator(mode="before")
    @classmethod
    def remap_frontend_keys(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "slot_10am_1pm" not in data and "slot_10_to_1" in data:
                data["slot_10am_1pm"] = data["slot_10_to_1"]
            if "slot_2pm_5pm" not in data and "slot_2_to_5" in data:
                data["slot_2pm_5pm"] = data["slot_2_to_5"]
            if "slot_5pm_6pm" not in data and "slot_5_to_6" in data:
                data["slot_5pm_6pm"] = data["slot_5_to_6"]
            if "lead_status_hp" not in data and "hp_count" in data:
                data["lead_status_hp"] = data["hp_count"]
            if "lead_status_p" not in data and "p_count" in data:
                data["lead_status_p"] = data["p_count"]
            if "lead_status_fub" not in data and "fub_count" in data:
                data["lead_status_fub"] = data["fub_count"]
            if "lead_status_ni" not in data and "ni_count" in data:
                data["lead_status_ni"] = data["ni_count"]
        return data


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
