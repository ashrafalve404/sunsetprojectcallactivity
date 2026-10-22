"""SettingsRepository — database access for AppSettings."""
from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import AppSettings


class SettingsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, namespace: str, key: str) -> Optional[AppSettings]:
        result = await self.db.execute(
            select(AppSettings).where(
                AppSettings.namespace == namespace,
                AppSettings.key == key,
            )
        )
        return result.scalar_one_or_none()

    async def get_namespace(self, namespace: str) -> Sequence[AppSettings]:
        result = await self.db.execute(
            select(AppSettings)
            .where(AppSettings.namespace == namespace)
            .order_by(AppSettings.key)
        )
        return result.scalars().all()

    async def get_all(self) -> Sequence[AppSettings]:
        result = await self.db.execute(select(AppSettings).order_by(AppSettings.namespace, AppSettings.key))
        return result.scalars().all()

    async def upsert(
        self,
        namespace: str,
        key: str,
        value: str,
        description: Optional[str] = None,
    ) -> AppSettings:
        existing = await self.get(namespace, key)
        if existing:
            existing.value = value
            if description is not None:
                existing.description = description
            self.db.add(existing)
            await self.db.flush()
            await self.db.refresh(existing)
            return existing
        else:
            setting = AppSettings(
                namespace=namespace, key=key, value=value, description=description
            )
            self.db.add(setting)
            await self.db.flush()
            await self.db.refresh(setting)
            return setting

    async def delete(self, namespace: str, key: str) -> bool:
        existing = await self.get(namespace, key)
        if existing:
            await self.db.delete(existing)
            await self.db.flush()
            return True
        return False
