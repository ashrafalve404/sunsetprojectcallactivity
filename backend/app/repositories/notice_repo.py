"""Repository for Notice Board data access."""
from __future__ import annotations

from typing import List, Optional, Sequence
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.notice import Notice, NoticeStatus, NoticeType
from app.models.user import User, UserRole


class NoticeRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def has_active_sub_admins(self) -> bool:
        """Check if any active sub-admin exists in the system."""
        stmt = (
            select(func.count(User.id))
            .where(User.role == UserRole.SUB_ADMIN, User.is_active.is_(True))
        )
        result = await self.db.execute(stmt)
        count = result.scalar() or 0
        return count > 0

    async def get_by_id(self, notice_id: int) -> Optional[Notice]:
        stmt = (
            select(Notice)
            .options(selectinload(Notice.created_by), selectinload(Notice.approved_by))
            .where(Notice.id == notice_id)
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def list_notices(
        self,
        status: Optional[NoticeStatus] = None,
        notice_type: Optional[NoticeType] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Sequence[Notice]:
        stmt = (
            select(Notice)
            .options(selectinload(Notice.created_by), selectinload(Notice.approved_by))
            .order_by(Notice.created_at.desc())
        )
        if status:
            stmt = stmt.where(Notice.status == status)
        if notice_type:
            stmt = stmt.where(Notice.notice_type == notice_type)

        stmt = stmt.offset(skip).limit(limit)
        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def create(self, notice: Notice) -> Notice:
        self.db.add(notice)
        await self.db.flush()
        await self.db.refresh(notice)
        return notice

    async def update(self, notice: Notice) -> Notice:
        await self.db.flush()
        await self.db.refresh(notice)
        return notice

    async def delete(self, notice: Notice) -> None:
        await self.db.delete(notice)
        await self.db.flush()
