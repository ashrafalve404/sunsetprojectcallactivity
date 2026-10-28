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
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Sequence[User]:
        stmt = select(User)
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                (User.full_name.ilike(pattern))
                | (User.username.ilike(pattern))
                | (User.email.ilike(pattern))
                | (User.phone.ilike(pattern))
            )
        stmt = stmt.offset(skip).limit(limit).order_by(User.id)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count_all(
        self,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> int:
        from sqlalchemy import func
        stmt = select(func.count(User.id))
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                (User.full_name.ilike(pattern))
                | (User.username.ilike(pattern))
                | (User.email.ilike(pattern))
                | (User.phone.ilike(pattern))
            )
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def get_next_employee_id(self) -> int:
        """
        Generate year-based numeric employee ID: YYYY001, YYYY002, etc. (e.g. 2026001).
        Automatically updates year when calendar year changes (e.g. 2026001 -> 2027001 in 2027).
        """
        from datetime import datetime, timezone, timedelta
        from sqlalchemy import func

        # Business timezone: Asia/Dhaka is UTC+6
        dhaka_year = (datetime.now(timezone.utc) + timedelta(hours=6)).year
        base_id = dhaka_year * 1000  # e.g. 2026000
        max_id_limit = (dhaka_year + 1) * 1000  # e.g. 2027000

        # Find maximum existing ID in this year's range (e.g. 2026001 - 2026999)
        stmt = select(func.max(User.id)).where(
            User.id >= base_id,
            User.id < max_id_limit,
        )
        res = await self.db.execute(stmt)
        max_id = res.scalar_one_or_none()

        if max_id is not None and max_id >= (base_id + 1):
            return max_id + 1

        # Check legacy short IDs (< 100000) created in the current year
        year_start = datetime(dhaka_year, 1, 1)
        year_end = datetime(dhaka_year + 1, 1, 1)
        stmt_legacy = select(func.max(User.id)).where(
            User.id < 100000,
            User.created_at >= year_start,
            User.created_at < year_end,
        )
        try:
            res_legacy = await self.db.execute(stmt_legacy)
            legacy_max = res_legacy.scalar_one_or_none()
        except Exception:
            legacy_max = None

        legacy_seq = legacy_max if legacy_max and legacy_max > 0 else 0
        return base_id + legacy_seq + 1

    async def create(self, user: User) -> User:
        if not user.id:
            user.id = await self.get_next_employee_id()
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
