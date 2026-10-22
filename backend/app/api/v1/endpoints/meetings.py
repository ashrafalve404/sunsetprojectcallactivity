"""Meeting activity endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.meeting_activity import MeetingEntriesRead, MeetingEntriesUpsert
from app.services.meeting_service import MeetingService

router = APIRouter(tags=["Meeting Activity"])


@router.get("/reports/{report_id}/meetings", response_model=MeetingEntriesRead)
async def get_meeting_entries(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = MeetingService(db)
    entries = await svc.get_entries(report_id, current_user)
    return MeetingEntriesRead(report_id=report_id, entries=list(entries))


@router.put("/reports/{report_id}/meetings", response_model=MeetingEntriesRead)
async def upsert_meeting_entries(
    report_id: int,
    data: MeetingEntriesUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = MeetingService(db)
    entries = await svc.upsert_entries(report_id, data, current_user)
    return MeetingEntriesRead(report_id=report_id, entries=list(entries))
