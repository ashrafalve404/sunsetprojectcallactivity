"""
Script to clear all transactional activity and sales/collection data.
All financial amounts (collections, commitments) and reports will be reset to 0,
while preserving all user accounts (Admin, Sub-Admin, Employees) and system settings.

Usage:
    cd backend
    python scripts/reset_data.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.call_activity import CallActivityEntry
from app.models.meeting_activity import MeetingActivityEntry
from app.models.report import DailyActivityReport
from app.models.sales_collection import SalesCollectionEntry


async def reset_data() -> None:
    print("=" * 60)
    print("  SUNSET GROUP DASHBOARD — RESET TRANSACTION DATA")
    print("=" * 60)

    engine = create_async_engine(settings.async_database_url)
    SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with SessionLocal() as db:
        # Delete entries in order of child -> parent
        res_sales = await db.execute(delete(SalesCollectionEntry))
        sales_deleted = res_sales.rowcount

        res_calls = await db.execute(delete(CallActivityEntry))
        calls_deleted = res_calls.rowcount

        res_meetings = await db.execute(delete(MeetingActivityEntry))
        meetings_deleted = res_meetings.rowcount

        res_reports = await db.execute(delete(DailyActivityReport))
        reports_deleted = res_reports.rowcount

        await db.commit()

        print("\nSuccessfully cleared:")
        print(f"  • Sales & Collection records : {sales_deleted} deleted")
        print(f"  • Call Activity entries     : {calls_deleted} deleted")
        print(f"  • Meeting & Visit entries   : {meetings_deleted} deleted")
        print(f"  • Daily Activity Reports    : {reports_deleted} deleted")
        print("\nAll amounts and collections are now ৳ 0.")
        print("User accounts (Admin, Sub-Admin, Employees) and settings are preserved.")
        print("=" * 60)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(reset_data())
