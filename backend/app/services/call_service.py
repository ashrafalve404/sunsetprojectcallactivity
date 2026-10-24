"""
CallService — business logic and calculations for call activity.

FORMULAS (documented):
  total_dialed = slot_10am_1pm + slot_2pm_5pm + slot_5pm_6pm
    (only when all three slots are non-null; otherwise use client-provided total_dialed)
  connection_rate = (total_connected / total_dialed * 100) if total_dialed > 0 else None
  Report-level totals = sum across all categories.

Assumption to confirm with Sunset Group:
  total_dialed is the sum of time-slot dials; the client may also provide it directly.
  We recalculate from slots when all three are present; otherwise accept the client value.
"""
from __future__ import annotations

from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.call_activity import CallActivityEntry
from app.models.report import DailyActivityReport, ReportStatus
from app.models.user import User, UserRole
from app.repositories.call_repo import CallActivityRepository
from app.repositories.report_repo import ReportRepository
from app.schemas.call_activity import (
    CallEntryBase,
    CallEntriesUpsert,
    CarryForwardInfo,
    CategoryCarryForward,
)


class CallService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.call_repo = CallActivityRepository(db)
        self.report_repo = ReportRepository(db)

    async def get_entries(
        self, report_id: int, current_user: User
    ) -> Sequence[CallActivityEntry]:
        await self._load_and_check_report(report_id, current_user)
        return await self.call_repo.get_by_report(report_id)

    async def get_carry_forward(
        self, report_id: int, current_user: User
    ) -> CarryForwardInfo:
        report = await self._load_and_check_report(report_id, current_user)

        stmt = (
            select(DailyActivityReport)
            .where(
                DailyActivityReport.employee_id == report.employee_id,
                DailyActivityReport.report_date < report.report_date,
            )
            .options(selectinload(DailyActivityReport.call_entries))
            .order_by(DailyActivityReport.report_date.asc())
        )
        result = await self.db.execute(stmt)
        prev_reports = list(result.scalars().all())

        if not prev_reports:
            return CarryForwardInfo(
                employee_id=report.employee_id,
                employee_name=report.employee.full_name if report.employee else None,
                previous_report_date=None,
                categories={},
            )

        latest_prev_report = prev_reports[-1]
        previous_report_date = latest_prev_report.report_date

        categories_dict: dict[str, CategoryCarryForward] = {}

        all_categories: set[str] = set()
        for r in prev_reports:
            for e in r.call_entries:
                if e.lead_category:
                    all_categories.add(e.lead_category)

        for cat in all_categories:
            prev_hp = sum(
                (e.lead_status_hp or 0)
                for r in prev_reports
                for e in r.call_entries
                if e.lead_category == cat
            )
            prev_p = sum(
                (e.lead_status_p or 0)
                for r in prev_reports
                for e in r.call_entries
                if e.lead_category == cat
            )
            prev_fub = sum(
                (e.lead_status_fub or 0)
                for r in prev_reports
                for e in r.call_entries
                if e.lead_category == cat
            )
            prev_ni = sum(
                (e.lead_status_ni or 0)
                for r in prev_reports
                for e in r.call_entries
                if e.lead_category == cat
            )

            # Most recent non-null till_today_status
            prev_till_today = 0
            for r in reversed(prev_reports):
                matching = [e for e in r.call_entries if e.lead_category == cat]
                if matching and matching[0].till_today_status is not None:
                    prev_till_today = matching[0].till_today_status
                    break

            categories_dict[cat] = CategoryCarryForward(
                lead_category=cat,
                prev_till_today=prev_till_today,
                prev_hp=prev_hp,
                prev_p=prev_p,
                prev_fub=prev_fub,
                prev_ni=prev_ni,
            )

        return CarryForwardInfo(
            employee_id=report.employee_id,
            employee_name=report.employee.full_name if report.employee else None,
            previous_report_date=previous_report_date,
            categories=categories_dict,
        )

    async def upsert_entries(
        self, report_id: int, data: CallEntriesUpsert, current_user: User
    ) -> Sequence[CallActivityEntry]:
        report = await self._load_and_check_report(report_id, current_user)
        self._guard_submitted(report, current_user)

        entries_data = []
        for entry in data.entries:
            d = entry.model_dump()
            # Recalculate total_dialed from slots when all three are provided
            slots = [d.get("slot_10am_1pm"), d.get("slot_2pm_5pm"), d.get("slot_5pm_6pm")]
            if all(s is not None for s in slots):
                d["total_dialed"] = sum(slots)
            entries_data.append(d)

        return await self.call_repo.upsert_entries(report_id, entries_data)

    async def _load_and_check_report(
        self, report_id: int, current_user: User
    ) -> DailyActivityReport:
        report = await self.report_repo.get_by_id(report_id, load_employee=True)
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
