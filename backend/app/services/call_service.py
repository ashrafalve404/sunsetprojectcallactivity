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

    @staticmethod
    def _normalize_category(cat: str) -> str:
        s = cat.lower().strip()
        if "high" in s:
            return "high_potential"
        if "potential" in s:
            return "potential"
        if "facebook" in s:
            return "facebook"
        if "fair" in s:
            return "fair_leads"
        if "follow" in s or "fub" in s:
            return "follow_up"
        if "other" in s or "not" in s or "reached" in s:
            return "other_not_reached"
        if "cold" in s or "new" in s:
            return "new_cold_leads"
        return s.replace(" ", "_").replace("&", "_")

    async def get_entries(
        self, report_id: int, current_user: User
    ) -> Sequence[CallActivityEntry]:
        await self._load_and_check_report(report_id, current_user)
        return await self.call_repo.get_by_report(report_id)

    async def get_carry_forward(
        self, report_id: int, current_user: User
    ) -> CarryForwardInfo:
        report = await self._load_and_check_report(report_id, current_user)

        # Find the latest report strictly prior to this report's date for this employee
        stmt = (
            select(DailyActivityReport)
            .where(
                DailyActivityReport.employee_id == report.employee_id,
                DailyActivityReport.report_date < report.report_date,
            )
            .options(selectinload(DailyActivityReport.call_entries))
            .order_by(DailyActivityReport.report_date.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        prev_report = result.scalar_one_or_none()

        if not prev_report or not prev_report.call_entries:
            return CarryForwardInfo(
                employee_id=report.employee_id,
                employee_name=report.employee.full_name if report.employee else None,
                previous_report_date=None,
                categories={},
            )

        CATEGORY_TO_STATUS = {
            "high_potential": "hp",
            "potential": "p",
            "follow_up": "fub",
            "other_not_reached": "ni",
        }

        DEFAULT_CATEGORIES = [
            "high_potential",
            "potential",
            "facebook",
            "fair_leads",
            "follow_up",
            "other_not_reached",
            "new_cold_leads",
        ]

        entries_by_cat: dict[str, CallActivityEntry] = {}
        for e in prev_report.call_entries:
            key = self._normalize_category(e.lead_category)
            entries_by_cat[key] = e

        all_cats = list(DEFAULT_CATEGORIES)
        for k in entries_by_cat.keys():
            if k not in all_cats:
                all_cats.append(k)

        # 1. Gather starting leads and outcomes for each category
        starts: dict[str, int] = {}
        moved_outs: dict[str, int] = {}
        outcomes: dict[str, dict[str, int]] = {}

        for cat in all_cats:
            e = entries_by_cat.get(cat)
            st = e.till_today_status if (e and e.till_today_status is not None) else 0
            hp = e.lead_status_hp if (e and e.lead_status_hp is not None) else 0
            p = e.lead_status_p if (e and e.lead_status_p is not None) else 0
            fub = e.lead_status_fub if (e and e.lead_status_fub is not None) else 0
            ni = e.lead_status_ni if (e and e.lead_status_ni is not None) else 0

            starts[cat] = st
            outcomes[cat] = {"hp": hp, "p": p, "fub": fub, "ni": ni}
            self_status = CATEGORY_TO_STATUS.get(cat)

            if self_status:
                moved_outs[cat] = sum(v for s, v in outcomes[cat].items() if s != self_status)
            else:
                moved_outs[cat] = sum(outcomes[cat].values())

        # 2. Compute moved_in and final updated totals
        categories_dict: dict[str, CategoryCarryForward] = {}
        DISPLAY_LABELS = {
            "high_potential": "High Potential",
            "potential": "Potential",
            "facebook": "Facebook",
            "fair_leads": "Fair Leads",
            "follow_up": "Follow Up",
            "other_not_reached": "Other & Not Reached",
            "new_cold_leads": "New Cold Leads",
        }

        for cat in all_cats:
            self_status = CATEGORY_TO_STATUS.get(cat)
            if self_status:
                moved_in = sum(
                    outcomes.get(other_cat, {}).get(self_status, 0)
                    for other_cat in all_cats
                    if other_cat != cat
                )
            else:
                moved_in = 0

            final_total = max(0, starts[cat] - moved_outs[cat] + moved_in)

            cf_obj = CategoryCarryForward(
                lead_category=cat,
                prev_till_today=final_total,
                prev_hp=final_total if self_status == "hp" else 0,
                prev_p=final_total if self_status == "p" else 0,
                prev_fub=final_total if self_status == "fub" else 0,
                prev_ni=final_total if self_status == "ni" else 0,
            )
            categories_dict[cat] = cf_obj
            label = DISPLAY_LABELS.get(cat)
            if label:
                categories_dict[label] = cf_obj

        return CarryForwardInfo(
            employee_id=report.employee_id,
            employee_name=report.employee.full_name if report.employee else None,
            previous_report_date=prev_report.report_date,
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
