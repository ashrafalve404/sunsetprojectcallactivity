"""Pydantic schemas for DailyTargets."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class TargetsBase(BaseModel):
    effective_from: date
    sales_target: Optional[Decimal] = Field(None, ge=Decimal("0"))
    tb_target: Optional[Decimal] = Field(None, ge=Decimal("0"))
    outdoor_visit_target: Optional[int] = Field(None, ge=0)
    dialed_calls_target: Optional[int] = Field(None, ge=0)
    connected_calls_target: Optional[int] = Field(None, ge=0)
    meeting_hours_target: Optional[Decimal] = Field(None, ge=Decimal("0"))
    employee_id: Optional[int] = None  # None = global default


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


class TargetsRead(TargetsBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
