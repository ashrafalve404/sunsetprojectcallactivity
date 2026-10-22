"""Call activity endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.call_activity import CallEntriesRead, CallEntriesUpsert
from app.services.call_service import CallService

router = APIRouter(tags=["Call Activity"])


@router.get("/reports/{report_id}/calls", response_model=CallEntriesRead)
async def get_call_entries(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = CallService(db)
    entries = await svc.get_entries(report_id, current_user)
    return CallEntriesRead(report_id=report_id, entries=list(entries))


@router.put("/reports/{report_id}/calls", response_model=CallEntriesRead)
async def upsert_call_entries(
    report_id: int,
    data: CallEntriesUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = CallService(db)
    entries = await svc.upsert_entries(report_id, data, current_user)
    return CallEntriesRead(report_id=report_id, entries=list(entries))
