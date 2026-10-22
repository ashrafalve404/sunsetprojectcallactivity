"""Pydantic schemas for DailyActivityReport."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.report import ReportStatus
from app.schemas.user import UserReadPublic


class ReportCreate(BaseModel):
    report_date: date
    employee_id: Optional[int] = None
    notes: Optional[str] = None


class ReportUpdate(BaseModel):
    notes: Optional[str] = None
    status: Optional[ReportStatus] = None


class ReportRead(BaseModel):
    id: int
    employee_id: int
    report_date: date
    notes: Optional[str]
    status: ReportStatus
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
    employee: Optional[UserReadPublic] = None

    model_config = {"from_attributes": True}


class ReportListItem(BaseModel):
    id: int
    employee_id: int
    report_date: date
    status: ReportStatus
    submitted_at: Optional[datetime]
    employee: Optional[UserReadPublic] = None

    model_config = {"from_attributes": True}


class PaginatedReports(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[ReportListItem]
