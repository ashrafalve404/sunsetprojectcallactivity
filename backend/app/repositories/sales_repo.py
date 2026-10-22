"""SalesCollectionRepository — database access for SalesCollectionEntry."""
from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sales_collection import SalesCollectionEntry


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
