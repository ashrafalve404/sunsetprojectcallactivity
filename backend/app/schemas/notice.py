"""Pydantic schemas for Notice Board endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.models.notice import NoticePriority, NoticeStatus, NoticeType


class NoticeBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    notice_type: NoticeType = NoticeType.TEXT
    content: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    priority: NoticePriority = NoticePriority.NORMAL


class NoticeCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    notice_type: NoticeType = NoticeType.TEXT
    content: Optional[str] = None
    priority: NoticePriority = NoticePriority.NORMAL


class NoticeApproval(BaseModel):
    status: NoticeStatus = Field(..., description="Must be published or rejected")
    approval_note: Optional[str] = Field(None, max_length=1000, description="Internal review note/comment visible only to admin and sub-admin")


class NoticeRead(NoticeBase):
    id: int
    status: NoticeStatus
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    approved_by_id: Optional[int] = None
    approved_by_name: Optional[str] = None
    approval_note: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
