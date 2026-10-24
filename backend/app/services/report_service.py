"""
ReportService — business logic for daily reports.

This is the authoritative place to enforce report lifecycle rules.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.report import DailyActivityReport, ReportStatus
from app.models.user import User, UserRole
from app.repositories.report_repo import ReportRepository
from app.schemas.report import ReportCreate, ReportUpdate


class ReportService:
    def __init__(self, db: AsyncSession) -> None:
        self.repo = ReportRepository(db)

    async def create_report(
        self, data: ReportCreate, current_user: User
    ) -> DailyActivityReport:
        target_emp_id = current_user.id
        if data.employee_id and current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            target_emp_id = data.employee_id

        # Check for duplicate; return existing if already present
        existing = await self.repo.get_by_employee_and_date(
            target_emp_id, data.report_date
        )
        if existing:
            return existing

        report = DailyActivityReport(
            employee_id=target_emp_id,
            report_date=data.report_date,
            notes=data.notes,
            status=ReportStatus.DRAFT,
        )
        return await self.repo.create(report)

    async def get_report_by_date(
        self,
        report_date: date,
        current_user: User,
        employee_id: Optional[int] = None,
    ) -> DailyActivityReport:
        target_emp_id = current_user.id
        if employee_id and current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            target_emp_id = employee_id

        report = await self.repo.get_by_employee_and_date(target_emp_id, report_date)
        if not report:
            raise HTTPException(
                status_code=404,
                detail=f"Report for date {report_date} not found.",
            )
        _assert_access(report, current_user)
        return report

    async def get_report(
        self, report_id: int, current_user: User
    ) -> DailyActivityReport:
        report = await self.repo.get_by_id(report_id, load_employee=True)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        _assert_access(report, current_user)
        return report

    async def list_reports(
        self,
        current_user: User,
        employee_id: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        status_filter: Optional[ReportStatus] = None,
        skip: int = 0,
        limit: int = 50,
    ):
        # Non-admins can only see their own reports
        if current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            employee_id = current_user.id

        total = await self.repo.count_reports(employee_id, date_from, date_to, status_filter)
        items = await self.repo.list_reports(
            employee_id=employee_id,
            date_from=date_from,
            date_to=date_to,
            status=status_filter,
            skip=skip,
            limit=limit,
        )
        return total, items

    async def update_report(
        self, report_id: int, data: ReportUpdate, current_user: User
    ) -> DailyActivityReport:
        report = await self.repo.get_by_id(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        _assert_access(report, current_user)
        if report.status == ReportStatus.SUBMITTED and current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot edit a submitted report. Contact admin.",
            )
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(report, field, value)
        return await self.repo.update(report)

    async def submit_report(
        self, report_id: int, current_user: User
    ) -> DailyActivityReport:
        report = await self.repo.get_by_id(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        _assert_access(report, current_user)
        if report.status == ReportStatus.SUBMITTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Report is already submitted.",
            )
        report.status = ReportStatus.SUBMITTED
        report.submitted_at = datetime.now(timezone.utc)
        return await self.repo.update(report)

    async def delete_report(
        self, report_id: int, current_user: User
    ) -> None:
        report = await self.repo.get_by_id(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        _assert_access(report, current_user)
        if report.status == ReportStatus.SUBMITTED and current_user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete a submitted report. Contact admin.",
            )
        await self.repo.delete(report)


def _assert_access(report: DailyActivityReport, user: User) -> None:
    """Raise 403 if user may not access this report."""
    if user.role not in (UserRole.ADMIN, UserRole.SUB_ADMIN) and report.employee_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this report.",
        )
