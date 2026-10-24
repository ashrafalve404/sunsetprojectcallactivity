"""SalesCollectionRepository — database access for SalesCollectionEntry."""
from __future__ import annotations

from datetime import date
from typing import Optional, Sequence

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.report import DailyActivityReport
from app.models.sales_collection import SalesCollectionEntry
from app.models.user import User


class SalesCollectionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_report(self, report_id: int) -> Sequence[SalesCollectionEntry]:
        result = await self.db.execute(
            select(SalesCollectionEntry)
            .where(SalesCollectionEntry.report_id == report_id)
            .order_by(SalesCollectionEntry.id)
        )
        return result.scalars().all()

    async def get_by_id(self, entry_id: int) -> Optional[SalesCollectionEntry]:
        result = await self.db.execute(
            select(SalesCollectionEntry).where(SalesCollectionEntry.id == entry_id)
        )
        return result.scalar_one_or_none()

    async def create(self, entry: SalesCollectionEntry) -> SalesCollectionEntry:
        self.db.add(entry)
        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def update(self, entry: SalesCollectionEntry) -> SalesCollectionEntry:
        self.db.add(entry)
        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def delete(self, entry: SalesCollectionEntry) -> None:
        await self.db.delete(entry)
        await self.db.flush()

    async def get_commitments(
        self,
        employee_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        commitment_categories: Optional[set[str]] = None,
    ) -> Sequence[tuple[SalesCollectionEntry, DailyActivityReport, User]]:
        conditions = []
        if commitment_categories:
            conditions.append(
                or_(
                    SalesCollectionEntry.expected_payment_date.isnot(None),
                    SalesCollectionEntry.category.in_(commitment_categories),
                )
            )
        else:
            conditions.append(SalesCollectionEntry.expected_payment_date.isnot(None))

        if employee_id is not None:
            conditions.append(DailyActivityReport.employee_id == employee_id)

        if date_from is not None:
            conditions.append(
                or_(
                    SalesCollectionEntry.expected_payment_date >= date_from,
                    SalesCollectionEntry.expected_payment_date.is_(None),
                )
            )

        if date_to is not None:
            conditions.append(
                or_(
                    SalesCollectionEntry.expected_payment_date <= date_to,
                    SalesCollectionEntry.expected_payment_date.is_(None),
                )
            )

        stmt = (
            select(SalesCollectionEntry, DailyActivityReport, User)
            .join(DailyActivityReport, SalesCollectionEntry.report_id == DailyActivityReport.id)
            .join(User, DailyActivityReport.employee_id == User.id)
            .where(*conditions)
            .order_by(
                SalesCollectionEntry.expected_payment_date.asc(),
                SalesCollectionEntry.id.desc(),
            )
        )
        result = await self.db.execute(stmt)
        return result.all()
