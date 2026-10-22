"""
MeetingService — business logic and calculations for meeting/visit activity.

FORMULAS (documented):
  total_duration_minutes = slot_10am_1pm + slot_2pm_5pm + slot_5pm_6pm
    (only when all three slots are non-null; otherwise accept client-provided value)
  For count-type activities (visits, CX), total_count is similarly aggregated from slots.

Assumption to confirm with Sunset Group:
  Whether "Number of Outdoor Visit" total is a slot sum or an independent count.
  Currently: if all three slots are provided, slot-sum overrides total_count.
"""
from __future__ import annotations

from typing import Sequence

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting_activity import MeetingActivityEntry
from app.models.report import DailyActivityReport, ReportStatus
from app.models.user import User, UserRole
from app.repositories.meeting_repo import MeetingActivityRepository
from app.repositories.report_repo import ReportRepository
from app.schemas.meeting_activity import MeetingEntriesUpsert


class MeetingService:
    def __init__(self, db: AsyncSession) -> None:
        self.meeting_repo = MeetingActivityRepository(db)
        self.report_repo = ReportRepository(db)

    async def get_entries(
        self, report_id: int, current_user: User
    ) -> Sequence[MeetingActivityEntry]:
        await self._load_and_check_report(report_id, current_user)
        return await self.meeting_repo.get_by_report(report_id)

    async def upsert_entries(
        self, report_id: int, data: MeetingEntriesUpsert, current_user: User
    ) -> Sequence[MeetingActivityEntry]:
        report = await self._load_and_check_report(report_id, current_user)
        self._guard_submitted(report, current_user)

        entries_data = []
        for entry in data.entries:
            d = entry.model_dump()
            slots = [d.get("slot_10am_1pm"), d.get("slot_2pm_5pm"), d.get("slot_5pm_6pm")]
            if all(s is not None for s in slots):
                slot_sum = sum(slots)
                # For duration types, update total_duration_minutes; for count types, total_count
                # We leave the distinction to activity_type label configuration.
                # Both fields receive the slot sum to avoid losing data.
                d["total_count"] = slot_sum
                d["total_duration_minutes"] = slot_sum
            entries_data.append(d)

        return await self.meeting_repo.upsert_entries(report_id, entries_data)

    async def _load_and_check_report(
        self, report_id: int, current_user: User
    ) -> DailyActivityReport:
        report = await self.report_repo.get_by_id(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        if current_user.role != UserRole.ADMIN and report.employee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        return report

    @staticmethod
    def _guard_submitted(report: DailyActivityReport, user: User) -> None:
        if report.status == ReportStatus.SUBMITTED and user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=403, detail="Cannot edit entries in a submitted report."
            )
