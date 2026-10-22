"""Dashboard endpoints."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_admin
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _default_from() -> date:
    return date.today() - timedelta(days=29)  # last 30 days


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    date_from: date = Query(default_factory=_default_from),
    date_to: date = Query(default_factory=date.today),
    employee_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregated dashboard summary.
    Non-admins are restricted to their own data regardless of employee_id param.
    """
    if current_user.role != UserRole.ADMIN:
        employee_id = current_user.id
    svc = DashboardService(db)
    return await svc.get_dashboard_summary(date_from, date_to, employee_id)


@router.get("/call-trends", response_model=DashboardSummary)
async def call_trends(
    date_from: date = Query(default_factory=_default_from),
    date_to: date = Query(default_factory=date.today),
    employee_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Call activity trends — same as summary but semantically for call data."""
    if current_user.role != UserRole.ADMIN:
        employee_id = current_user.id
    svc = DashboardService(db)
    return await svc.get_dashboard_summary(date_from, date_to, employee_id)


@router.get("/lead-breakdown", response_model=DashboardSummary)
async def lead_breakdown(
    date_from: date = Query(default_factory=_default_from),
    date_to: date = Query(default_factory=date.today),
    employee_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lead category breakdown for the given period."""
    if current_user.role != UserRole.ADMIN:
        employee_id = current_user.id
    svc = DashboardService(db)
    return await svc.get_dashboard_summary(date_from, date_to, employee_id)


@router.get("/sales-collection", response_model=DashboardSummary)
async def sales_collection_summary(
    date_from: date = Query(default_factory=_default_from),
    date_to: date = Query(default_factory=date.today),
    employee_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sales and collection summary for the given period."""
    if current_user.role != UserRole.ADMIN:
        employee_id = current_user.id
    svc = DashboardService(db)
    return await svc.get_dashboard_summary(date_from, date_to, employee_id)


@router.get("/employee-performance", response_model=DashboardSummary)
async def employee_performance(
    date_from: date = Query(default_factory=_default_from),
    date_to: date = Query(default_factory=date.today),
    employee_id: Optional[int] = Query(None),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Employee performance summary — admin only."""
    svc = DashboardService(db)
    return await svc.get_dashboard_summary(date_from, date_to, employee_id)
