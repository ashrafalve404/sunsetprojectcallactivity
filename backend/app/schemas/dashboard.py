"""Pydantic schemas for DailyTargets and dashboard summaries."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class TargetsBase(BaseModel):
    effective_from: date
    sales_target: Optional[Decimal] = Field(None, decimal_places=2, ge=Decimal("0"))
    tb_target: Optional[Decimal] = Field(None, decimal_places=2, ge=Decimal("0"))
    outdoor_visit_target: Optional[int] = Field(None, ge=0)
    dialed_calls_target: Optional[int] = Field(None, ge=0)
    connected_calls_target: Optional[int] = Field(None, ge=0)
    meeting_hours_target: Optional[Decimal] = Field(None, decimal_places=2, ge=Decimal("0"))
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


# ─── Dashboard / Summary Schemas ──────────────────────────────────────────────

class SlotBreakdown(BaseModel):
    slot_10am_1pm: Optional[int] = None
    slot_2pm_5pm: Optional[int] = None
    slot_5pm_6pm: Optional[int] = None


class LeadCategoryBreakdown(BaseModel):
    lead_category: str
    total_dialed: Optional[int] = None
    total_connected: Optional[int] = None
    total_duration_minutes: Optional[int] = None
    lead_status_hp: Optional[int] = None
    lead_status_p: Optional[int] = None
    lead_status_fub: Optional[int] = None
    lead_status_ni: Optional[int] = None


class TargetAchievement(BaseModel):
    """Pairs an actual value with its target. achievement_pct is None if no target."""
    actual: Optional[Decimal] = None
    target: Optional[Decimal] = None
    achievement_pct: Optional[Decimal] = None


class ReportSummary(BaseModel):
    """Calculated summary for a single daily report."""
    report_id: int
    report_date: date
    employee_id: int
    employee_name: Optional[str] = None

    # Call totals
    total_dialed: int = 0
    total_connected: int = 0
    connection_rate_pct: Optional[Decimal] = None
    total_call_duration_minutes: int = 0

    # Slot totals (across all categories)
    call_slots: SlotBreakdown = SlotBreakdown()

    # Meeting
    total_outdoor_visits: int = 0
    total_meeting_duration_minutes: int = 0

    # Financial (BDT) — actual vs commitments are SEPARATE
    total_new_sales: Decimal = Decimal("0")
    total_actual_collection: Decimal = Decimal("0")
    total_sales_commitments: Decimal = Decimal("0")
    total_tb_collection: Decimal = Decimal("0")
    total_tb_commitments: Decimal = Decimal("0")
    total_emi_collection: Decimal = Decimal("0")

    # Target achievement
    dialed_calls: TargetAchievement = TargetAchievement()
    connected_calls: TargetAchievement = TargetAchievement()
    outdoor_visits: TargetAchievement = TargetAchievement()
    sales: TargetAchievement = TargetAchievement()
    tb: TargetAchievement = TargetAchievement()
    meeting_hours: TargetAchievement = TargetAchievement()

    # Breakdowns
    lead_category_breakdown: list[LeadCategoryBreakdown] = []


class DashboardSummary(BaseModel):
    """Aggregated summary across a date range / employee filter."""
    date_from: date
    date_to: date
    employee_id: Optional[int] = None
    report_count: int = 0

    total_dialed: int = 0
    total_connected: int = 0
    connection_rate_pct: Optional[Decimal] = None
    total_call_duration_minutes: int = 0
    total_outdoor_visits: int = 0
    total_meeting_duration_minutes: int = 0

    total_new_sales: Decimal = Decimal("0")
    total_actual_collection: Decimal = Decimal("0")
    total_tb_collection: Decimal = Decimal("0")
    total_emi_collection: Decimal = Decimal("0")

    lead_category_breakdown: list[LeadCategoryBreakdown] = []
