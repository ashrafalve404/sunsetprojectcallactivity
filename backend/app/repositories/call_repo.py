"""CallActivityRepository — database access for CallActivityEntry."""
from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_activity import CallActivityEntry


class CallActivityRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_report(self, report_id: int) -> Sequence[CallActivityEntry]:
        result = await self.db.execute(
            select(CallActivityEntry)
            .where(CallActivityEntry.report_id == report_id)
            .order_by(CallActivityEntry.id)
        )
        return result.scalars().all()

    async def get_by_id(self, entry_id: int) -> Optional[CallActivityEntry]:
        result = await self.db.execute(
            select(CallActivityEntry).where(CallActivityEntry.id == entry_id)
        )
        return result.scalar_one_or_none()

    async def get_by_report_and_category(
        self, report_id: int, lead_category: str
    ) -> Optional[CallActivityEntry]:
        result = await self.db.execute(
            select(CallActivityEntry).where(
                CallActivityEntry.report_id == report_id,
                CallActivityEntry.lead_category == lead_category,
            )
        )
        return result.scalar_one_or_none()

    async def delete_all_for_report(self, report_id: int) -> None:
        entries = await self.get_by_report(report_id)
        for entry in entries:
            await self.db.delete(entry)
        await self.db.flush()

    async def upsert_entries(
        self,
        report_id: int,
        entries_data: list[dict],
    ) -> Sequence[CallActivityEntry]:
        """
        Replace all call entries for a report with the provided data.
        Deletes existing and inserts fresh rows. Returns the new entries.
        """
        await self.delete_all_for_report(report_id)
        new_entries = []
        for data in entries_data:
            entry = CallActivityEntry(report_id=report_id, **data)
            self.db.add(entry)
            new_entries.append(entry)
        await self.db.flush()
        for entry in new_entries:
            await self.db.refresh(entry)
        return new_entries
