"""Automatic safe column check/migration on app startup."""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

async def ensure_schema_updates(engine: AsyncEngine, is_sqlite: bool) -> None:
    try:
        async with engine.begin() as conn:
            if is_sqlite:
                result = await conn.execute(text("PRAGMA table_info(sales_collection_entries)"))
                existing_cols = {row[1] for row in result.fetchall()}
                if not existing_cols:
                    return

                if "expected_payment_date" not in existing_cols:
                    await conn.execute(text("ALTER TABLE sales_collection_entries ADD COLUMN expected_payment_date DATE"))
                    logger.info("Added expected_payment_date to sales_collection_entries")
                if "reschedule_count" not in existing_cols:
                    await conn.execute(text("ALTER TABLE sales_collection_entries ADD COLUMN reschedule_count INTEGER NOT NULL DEFAULT 0"))
                    logger.info("Added reschedule_count to sales_collection_entries")
                if "reschedule_history" not in existing_cols:
                    await conn.execute(text("ALTER TABLE sales_collection_entries ADD COLUMN reschedule_history JSON"))
                    logger.info("Added reschedule_history to sales_collection_entries")
            else:
                await conn.execute(text("""
                    ALTER TABLE sales_collection_entries 
                    ADD COLUMN IF NOT EXISTS expected_payment_date DATE,
                    ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS reschedule_history JSONB;
                """))
    except Exception as exc:
        logger.warning("ensure_schema_updates warning (non-fatal): %s", exc)
