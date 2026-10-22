"""TargetsRepository — database access for DailyTargets."""
from __future__ import annotations

from datetime import date
from typing import Optional, Sequence

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.targets import DailyTargets


class TargetsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_effective_target(
        self, report_date: date, employee_id: Optional[int] = None
    ) -> Optional[DailyTargets]:
        """
        Return the most applicable target for a given date and optional employee.
        Lookup order:
          1. Employee-specific target with effective_from <= report_date (most recent)
          2. Global target (employee_id IS NULL) with effective_from <= report_date
        """
        if employee_id is not None:
            stmt = (
                select(DailyTargets)
                .where(
                    DailyTargets.employee_id == employee_id,
                    DailyTargets.effective_from <= report_date,
                )
                .order_by(DailyTargets.effective_from.desc())
                .limit(1)
            )
            result = await self.db.execute(stmt)
            target = result.scalar_one_or_none()
            if target:
                return target

        # Fall back to global target
        stmt = (
            select(DailyTargets)
            .where(
                DailyTargets.employee_id.is_(None),
                DailyTargets.effective_from <= report_date,
            )
            .order_by(DailyTargets.effective_from.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_targets(
        self, employee_id: Optional[int] = None, global_only: bool = False
    ) -> Sequence[DailyTargets]:
        stmt = select(DailyTargets)
        if global_only:
            stmt = stmt.where(DailyTargets.employee_id.is_(None))
        elif employee_id is not None:
            stmt = stmt.where(DailyTargets.employee_id == employee_id)
        result = await self.db.execute(stmt.order_by(DailyTargets.effective_from.desc()))
        return result.scalars().all()

    async def get_by_id(self, target_id: int) -> Optional[DailyTargets]:
        result = await self.db.execute(
            select(DailyTargets).where(DailyTargets.id == target_id)
        )
        return result.scalar_one_or_none()

    async def create(self, target: DailyTargets) -> DailyTargets:
        self.db.add(target)
        await self.db.flush()
        await self.db.refresh(target)
        return target

    async def update(self, target: DailyTargets) -> DailyTargets:
        self.db.add(target)
        await self.db.flush()
        await self.db.refresh(target)
        return target

    async def delete(self, target: DailyTargets) -> None:
        await self.db.delete(target)
        await self.db.flush()
