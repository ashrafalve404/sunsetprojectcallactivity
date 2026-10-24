"""
SalesService — business logic and calculations for sales/collection entries.

FINANCIAL RULES (documented):
  actual_collection_categories: amounts that represent money physically collected today.
    - new_sales_collection
    - tb_collection
    - emi_collection

  commitment_categories: promises of future payment — NEVER add to actual collections.
    - new_sales_commit_payment, new_sales_commit_payment_2, new_sales_commit_payment_3
    - total_token_to_booking_commit, total_token_to_booking_commit_2, total_token_to_booking_commit_3

  sales_categories: booked/contracted sales (separate from cash collected).
    - total_sales
    - new_sales

All amounts in BDT using Python Decimal arithmetic.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Sequence

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.report import DailyActivityReport, ReportStatus
from app.models.sales_collection import SalesCollectionEntry
from app.models.user import User, UserRole
from app.repositories.report_repo import ReportRepository
from app.repositories.sales_repo import SalesCollectionRepository
from app.schemas.sales_collection import (
    SalesCollectionEntryCreate,
    SalesCollectionEntryUpdate,
)

# Stable category keys — display labels come from AppSettings
ACTUAL_COLLECTION_CATEGORIES = {
    "new_sales_collection",
    "tb_collection",
    "emi_collection",
}
COMMITMENT_CATEGORIES = {
    "new_sales_commit_payment",
    "new_sales_commit_payment_2",
    "new_sales_commit_payment_3",
    "total_token_to_booking_commit",
    "total_token_to_booking_commit_2",
    "total_token_to_booking_commit_3",
}
SALES_CATEGORIES = {"total_sales", "new_sales"}
TB_COLLECTION_CATEGORIES = {"tb_collection"}


class SalesService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = SalesCollectionRepository(db)
        self.report_repo = ReportRepository(db)

    async def get_entries(
        self, report_id: int, current_user: User
    ) -> Sequence[SalesCollectionEntry]:
        await self._load_and_check_report(report_id, current_user)
        return await self.repo.get_by_report(report_id)

    async def create_entry(
        self,
        report_id: int,
        data: SalesCollectionEntryCreate,
        current_user: User,
    ) -> SalesCollectionEntry:
        report = await self._load_and_check_report(report_id, current_user)
        self._guard_submitted(report, current_user)
        entry = SalesCollectionEntry(
            report_id=report_id,
            **data.model_dump(),
        )
        return await self.repo.create(entry)

    async def update_entry(
        self,
        entry_id: int,
        data: SalesCollectionEntryUpdate,
        current_user: User,
    ) -> SalesCollectionEntry:
        entry = await self.repo.get_by_id(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        report = await self._load_and_check_report(entry.report_id, current_user)
        self._guard_submitted(report, current_user)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(entry, field, value)
        return await self.repo.update(entry)

    async def delete_entry(self, entry_id: int, current_user: User) -> None:
        entry = await self.repo.get_by_id(entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        report = await self._load_and_check_report(entry.report_id, current_user)
        self._guard_submitted(report, current_user)
        await self.repo.delete(entry)

    # ── Financial calculation helpers (reused by dashboard service) ──────────

    @staticmethod
    def calc_totals(
        entries: Sequence[SalesCollectionEntry],
    ) -> dict[str, Decimal]:
        """
        Compute financial totals from a list of SalesCollectionEntry rows.
        Returns a dict with:
          total_new_sales         — sum of new_sales category
          total_actual_collection — sum of actual collection categories (cash in)
          total_sales_commitments — sum of new-sales commitment categories
          total_tb_collection     — sum of TB collection
          total_tb_commitments    — sum of token-to-booking commitment categories
          total_emi_collection    — sum of EMI collection
        """
        totals: dict[str, Decimal] = {
            "total_new_sales": Decimal("0"),
            "total_actual_collection": Decimal("0"),
            "total_sales_commitments": Decimal("0"),
            "total_tb_collection": Decimal("0"),
            "total_tb_commitments": Decimal("0"),
            "total_emi_collection": Decimal("0"),
        }
        for entry in entries:
            amount = Decimal(str(entry.amount))
            cat = entry.category
            if cat == "new_sales":
                totals["total_new_sales"] += amount
            if cat in ACTUAL_COLLECTION_CATEGORIES:
                totals["total_actual_collection"] += amount
            if cat in TB_COLLECTION_CATEGORIES:
                totals["total_tb_collection"] += amount
            if cat == "emi_collection":
                totals["total_emi_collection"] += amount
            # Commitment categories — kept SEPARATE from actual
            if cat in COMMITMENT_CATEGORIES:
                if cat.startswith("new_sales"):
                    totals["total_sales_commitments"] += amount
                else:
                    totals["total_tb_commitments"] += amount
        return totals

    async def _load_and_check_report(
        self, report_id: int, current_user: User
    ) -> DailyActivityReport:
        report = await self.report_repo.get_by_id(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        if current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN) and report.employee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        return report

    @staticmethod
    def _guard_submitted(report: DailyActivityReport, user: User) -> None:
        if report.status == ReportStatus.SUBMITTED and user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=403, detail="Cannot edit entries in a submitted report."
            )
