"""UserRepository — database access for User model."""
from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_username_or_email(self, login: str) -> Optional[User]:
        """Look up by username OR email — used for login."""
        result = await self.db.execute(
            select(User).where(
                (User.username == login) | (User.email == login)
            )
        )
        return result.scalar_one_or_none()

    async def list_all(
        self,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Sequence[User]:
        stmt = select(User)
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        stmt = stmt.offset(skip).limit(limit).order_by(User.id)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count_all(
        self,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
    ) -> int:
        from sqlalchemy import func
        stmt = select(func.count(User.id))
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def create(self, user: User) -> User:
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def update(self, user: User) -> User:
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def delete(self, user: User) -> None:
        from app.models.report import DailyActivityReport
        from app.models.targets import DailyTargets

        # Cleanly delete all associated reports for this employee
        # (their call_entries, meeting_entries, and sales_collection_entries cascade automatically)
        reports_stmt = select(DailyActivityReport).where(DailyActivityReport.employee_id == user.id)
        reports_res = await self.db.execute(reports_stmt)
        reports = list(reports_res.scalars().all())
        for r in reports:
            await self.db.delete(r)

        # Cleanly delete associated targets for this employee
        targets_stmt = select(DailyTargets).where(DailyTargets.employee_id == user.id)
        targets_res = await self.db.execute(targets_stmt)
        for t in list(targets_res.scalars().all()):
            await self.db.delete(t)

        await self.db.delete(user)
        await self.db.flush()
