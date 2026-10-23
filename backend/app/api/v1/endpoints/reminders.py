"""Reminders API endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.reminders import RemindersResponse
from app.services.reminder_service import ReminderService

router = APIRouter(prefix="/reminders", tags=["Reminders"])


@router.get("", response_model=RemindersResponse)
async def get_reminders(
    employee_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = ReminderService(db)
    return await svc.get_reminders(current_user=current_user, target_employee_id=employee_id)
