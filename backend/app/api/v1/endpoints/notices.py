"""Notice Board endpoints."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_admin
from app.db.session import get_db
from app.models.notice import NoticePriority, NoticeStatus, NoticeType
from app.models.user import User, UserRole
from app.schemas.notice import NoticeApproval, NoticeCreate, NoticeRead
from app.services.notice_service import NoticeService

router = APIRouter(prefix="/notices", tags=["Notice Board"])


@router.get("", response_model=List[NoticeRead])
async def list_notices(
    status: Optional[NoticeStatus] = Query(None),
    notice_type: Optional[NoticeType] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List notices.
    Regular employees will only receive PUBLISHED notices and approval notes are stripped.
    Admins and Sub-admins see all statuses and internal approval notes.
    """
    svc = NoticeService(db)
    return await svc.list_notices(
        current_user=current_user,
        status_filter=status,
        notice_type=notice_type,
        skip=skip,
        limit=limit,
    )


@router.get("/{notice_id}", response_model=NoticeRead)
async def get_notice(
    notice_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single notice by ID."""
    svc = NoticeService(db)
    return await svc.get_notice(notice_id, current_user)


@router.post("/text", response_model=NoticeRead, status_code=201)
async def create_text_notice(
    payload: NoticeCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a text-based corporate notice.
    If sub-admins exist in the system, it will be placed in PENDING_APPROVAL.
    If no sub-admins exist, it is published immediately.
    """
    svc = NoticeService(db)
    return await svc.create_text_notice(
        title=payload.title,
        content=payload.content or "",
        priority=payload.priority,
        current_user=current_user,
    )


@router.post("/pdf", response_model=NoticeRead, status_code=201)
async def create_pdf_notice(
    title: str = Form(...),
    priority: NoticePriority = Form(NoticePriority.NORMAL),
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a PDF notice.
    PDF notices are published immediately without requiring sub-admin approval.
    """
    svc = NoticeService(db)
    return await svc.create_pdf_notice(
        title=title,
        file=file,
        priority=priority,
        current_user=current_user,
    )


@router.post("/{notice_id}/review", response_model=NoticeRead)
async def review_notice(
    notice_id: int,
    approval: NoticeApproval,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Sub-admin (or Admin) approves or rejects a text notice with an internal note/comment.
    Internal notes are only visible to Admins and Sub-admins.
    """
    svc = NoticeService(db)
    return await svc.review_notice(
        notice_id=notice_id,
        approval_data=approval,
        current_user=current_user,
    )


@router.delete("/{notice_id}", status_code=204)
async def delete_notice(
    notice_id: int,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a notice (Admin / Sub-admin only)."""
    svc = NoticeService(db)
    await svc.delete_notice(notice_id, current_user)
