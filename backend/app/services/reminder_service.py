"""Reminder and Notification Service."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.report import DailyActivityReport, ReportStatus
from app.models.sales_collection import SalesCollectionEntry
from app.models.user import User, UserRole
from app.schemas.reminders import ReminderItem, ReminderSummary, RemindersResponse


def get_dhaka_now() -> datetime:
    # Dhaka is UTC+6
    return datetime.now(timezone.utc) + timedelta(hours=6)


class ReminderService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_reminders(
        self,
        current_user: User,
        target_employee_id: Optional[int] = None,
    ) -> RemindersResponse:
        # Determine employee id: if employee, always their own; if admin, either target or own
        emp_id = current_user.id
        if current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN) and target_employee_id:
            emp_id = target_employee_id

        dhaka_now = get_dhaka_now()
        today = dhaka_now.date()
        today_str = str(today)
        hour = dhaka_now.hour

        reminders: List[ReminderItem] = []
        follow_ups_today_count = 0
        overdue_count = 0
        unsubmitted_report = False

        # ── 1. Check Today's Report Status ────────────────────────────────────
        rep_query = await self.db.execute(
            select(DailyActivityReport).where(
                DailyActivityReport.employee_id == emp_id,
                DailyActivityReport.report_date == today,
            )
        )
        today_report = rep_query.scalar_one_or_none()

        if not today_report or today_report.status != ReportStatus.SUBMITTED:
            unsubmitted_report = True
            is_evening = hour >= 17
            reminders.append(
                ReminderItem(
                    id=f"rep-unsubmitted-{today_str}",
                    type="report_submission",
                    severity="urgent" if is_evening else "warning",
                    title="Daily Report Not Submitted" if is_evening else "Daily Report Pending",
                    message="Today's report is pending submission.",
                    date=today_str,
                    link=f"/calls?date={today_str}",
                    action_label="Submit",
                )
            )

        # ── 2. Check Client Follow-Ups in Recent Reports (Last 30 Days) ──────
        thirty_days_ago = today - timedelta(days=30)
        recent_reports_q = await self.db.execute(
            select(DailyActivityReport)
            .where(
                DailyActivityReport.employee_id == emp_id,
                DailyActivityReport.report_date >= thirty_days_ago,
                DailyActivityReport.notes.isnot(None),
            )
            .order_by(DailyActivityReport.report_date.desc())
        )
        recent_reports = recent_reports_q.scalars().all()

        seen_clients = set()

        for rep in recent_reports:
            if not rep.notes:
                continue
            try:
                data = json.loads(rep.notes)
                contacts = data.get("client_contacts", [])
                if not isinstance(contacts, list):
                    continue

                for idx, c in enumerate(contacts):
                    client_name = c.get("client_name", "").strip()
                    follow_up_date = c.get("follow_up_date", "").strip()
                    if not client_name or not follow_up_date:
                        continue

                    # Avoid duplicate reminders for the same client name
                    if client_name.lower() in seen_clients:
                        continue
                    seen_clients.add(client_name.lower())

                    phone = c.get("phone_number", "")
                    category = c.get("category", "HP")
                    notes = c.get("discussion_notes", "")

                    if follow_up_date == today_str:
                        follow_ups_today_count += 1
                        reminders.append(
                            ReminderItem(
                                id=f"fu-today-{rep.id}-{idx}",
                                type="follow_up_today",
                                severity="urgent",
                                title=f"Follow-up Today: {client_name}",
                                message=f"Priority: {category} | Phone: {phone or 'N/A'}" + (f" | {notes}" if notes else ""),
                                client_name=client_name,
                                phone_number=phone,
                                category=category,
                                date=today_str,
                                link=f"/calls?date={rep.report_date}",
                                action_label="View / Call",
                            )
                        )
                    elif follow_up_date < today_str and follow_up_date >= str(today - timedelta(days=14)):
                        overdue_count += 1
                        reminders.append(
                            ReminderItem(
                                id=f"fu-overdue-{rep.id}-{idx}",
                                type="follow_up_overdue",
                                severity="warning",
                                title=f"Overdue Follow-up: {client_name}",
                                message=f"Scheduled for {follow_up_date} ({category}) | Phone: {phone or 'N/A'}",
                                client_name=client_name,
                                phone_number=phone,
                                category=category,
                                date=follow_up_date,
                                link=f"/calls?date={rep.report_date}",
                                action_label="Follow-up Now",
                            )
                        )
            except Exception:
                continue

        # ── 3. Check Recent Commitments (Sales & TB) ─────────────────────────
        commit_q = await self.db.execute(
            select(SalesCollectionEntry)
            .join(DailyActivityReport)
            .where(
                DailyActivityReport.employee_id == emp_id,
                DailyActivityReport.report_date >= (today - timedelta(days=7)),
                SalesCollectionEntry.category.like("%commit%"),
            )
            .order_by(SalesCollectionEntry.id.desc())
            .limit(5)
        )
        commitments = commit_q.scalars().all()
        for comm in commitments:
            if comm.customer_name and comm.amount:
                cat_label = comm.category.replace("_", " ").title()
                reminders.append(
                    ReminderItem(
                        id=f"commit-{comm.id}",
                        type="commitment_due",
                        severity="info",
                        title=f"Commitment: {comm.customer_name}",
                        message=f"{cat_label} of ৳{comm.amount:,.0f} recorded. Follow up for collection.",
                        client_name=comm.customer_name,
                        link="/sales",
                        action_label="View Sales",
                    )
                )

        # ── 4. Call Slot Mid-Day Nudge ────────────────────────────────────────
        slot_nudge_text = None
        if 10 <= hour < 13:
            slot_nudge_text = "Slot 1 (10 AM – 1 PM)"
        elif 13 <= hour < 14:
            slot_nudge_text = "Slot 1 Ended"
        elif 14 <= hour < 17:
            slot_nudge_text = "Slot 2 (2 PM – 5 PM)"
        elif 17 <= hour < 18:
            slot_nudge_text = "Slot 3 (5 PM – 6 PM)"
        elif hour >= 18:
            slot_nudge_text = "End of Day"

        summary = ReminderSummary(
            total_count=len(reminders),
            follow_ups_today_count=follow_ups_today_count,
            overdue_count=overdue_count,
            unsubmitted_report=unsubmitted_report,
            slot_nudge=slot_nudge_text,
        )

        return RemindersResponse(summary=summary, reminders=reminders)
