"""Pydantic schemas for DailyTargets."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator


class TargetsBase(BaseModel):
    effective_from: date
    sales_target: Optional[Decimal] = Field(None, ge=Decimal("0"))
    tb_target: Optional[Decimal] = Field(None, ge=Decimal("0"))
    outdoor_visit_target: Optional[int] = Field(None, ge=0)
    dialed_calls_target: Optional[int] = Field(None, ge=0)
    connected_calls_target: Optional[int] = Field(None, ge=0)
    meeting_hours_target: Optional[Decimal] = Field(None, ge=Decimal("0"))
    employee_id: Optional[int] = None  # None = global default

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Map target_date to effective_from
            if not data.get("effective_from") and data.get("target_date"):
                data["effective_from"] = data["target_date"]
            if not data.get("effective_from"):
                data["effective_from"] = date.today()

            # Map alias names
            if "outdoor_visit_target" not in data and "outdoor_visits_target" in data:
                data["outdoor_visit_target"] = data["outdoor_visits_target"]
            if "meeting_hours_target" not in data and "meeting_minutes_target" in data:
                val = data["meeting_minutes_target"]
                data["meeting_hours_target"] = (
                    round(Decimal(str(val)) / Decimal("60"), 2)
                    if val is not None
                    else None
                )
            if "sales_target" not in data and "sales_amount_target" in data:
                data["sales_target"] = data["sales_amount_target"]
            if "tb_target" not in data and "collection_amount_target" in data:
                data["tb_target"] = data["collection_amount_target"]
        return data


class TargetsCreate(TargetsBase):
    pass


class TargetsUpdate(BaseModel):
    effective_from: Optional[date] = None
    sales_target: Optional[Decimal] = None
    tb_target: Optional[Decimal] = None
    outdoor_visit_target: Optional[int] = None
    dialed_calls_target: Optional[int] = None
    connected_calls_target: Optional[int] = None
    meeting_hours_target: Optional[Decimal] = None
    employee_id: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "effective_from" not in data and "target_date" in data:
                data["effective_from"] = data["target_date"]
            if "outdoor_visit_target" not in data and "outdoor_visits_target" in data:
                data["outdoor_visit_target"] = data["outdoor_visits_target"]
            if "meeting_hours_target" not in data and "meeting_minutes_target" in data:
                val = data["meeting_minutes_target"]
                data["meeting_hours_target"] = (
                    round(Decimal(str(val)) / Decimal("60"), 2)
                    if val is not None
                    else None
                )
            if "sales_target" not in data and "sales_amount_target" in data:
                data["sales_target"] = data["sales_amount_target"]
            if "tb_target" not in data and "collection_amount_target" in data:
                data["tb_target"] = data["collection_amount_target"]
        return data


class TargetsRead(TargetsBase):
    id: int
    created_at: datetime
    updated_at: datetime

    # Display aliases for frontend convenience
    target_date: Optional[date] = None
    outdoor_visits_target: Optional[int] = None
    meeting_minutes_target: Optional[int] = None
    sales_amount_target: Optional[Decimal] = None
    collection_amount_target: Optional[Decimal] = None

    @model_validator(mode="after")
    def populate_aliases(self) -> "TargetsRead":
        self.target_date = self.effective_from
        self.outdoor_visits_target = self.outdoor_visit_target
        if self.meeting_hours_target is not None:
            self.meeting_minutes_target = int(float(self.meeting_hours_target) * 60)
        self.sales_amount_target = self.sales_target
        self.collection_amount_target = self.tb_target
        return self

    model_config = {"from_attributes": True}
