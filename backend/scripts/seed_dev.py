"""
Development seed script — creates a demo admin account ONLY.

Run explicitly with:
    python scripts/seed_dev.py

NEVER run this automatically in production.
This script does NOT insert fake business data (call records, reports, etc.).
"""
from __future__ import annotations

import asyncio
import sys

# Ensure the backend/ directory is in sys.path
sys.path.insert(0, ".")

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base  # noqa: F401 — register all models
from app.models.user import User, UserRole
from app.repositories.user_repo import UserRepository


async def seed() -> None:
    engine = create_async_engine(settings.async_database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with SessionLocal() as session:
        repo = UserRepository(session)
        existing = await repo.get_by_username("admin")
        if existing:
            print("Admin user already exists — skipping seed.")
            return

        admin = User(
            full_name="Sunset Admin",
            email="admin@sunsetgroup.com",
            username="admin",
            password_hash=hash_password("ChangeMe123!"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        await repo.create(admin)
        await session.commit()
        print("Demo admin created:")
        print("  username : admin")
        print("  password : ChangeMe123!")
        print("  ⚠ CHANGE THIS PASSWORD IMMEDIATELY after first login.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
