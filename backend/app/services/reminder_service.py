"""Reminder and Notification Service."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from urllib.parse import quote_plus

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

        # ── 3. Check Promised Payment Commitments (Due Today, Overdue, Soon) ──
        is_admin_all = current_user.role in (UserRole.ADMIN, UserRole.SUB_ADMIN) and not target_employee_id

        # Query commitments where expected_payment_date is set (from 30 days overdue to 2 days upcoming)
        comm_filters = [
            SalesCollectionEntry.expected_payment_date.isnot(None),
            SalesCollectionEntry.expected_payment_date <= today + timedelta(days=2),
            SalesCollectionEntry.expected_payment_date >= today - timedelta(days=30),
        ]
        if not is_admin_all:
            comm_filters.append(DailyActivityReport.employee_id == emp_id)

        comm_query = (
            select(SalesCollectionEntry, DailyActivityReport, User)
            .join(DailyActivityReport, SalesCollectionEntry.report_id == DailyActivityReport.id)
            .join(User, DailyActivityReport.employee_id == User.id)
            .where(*comm_filters)
            .order_by(SalesCollectionEntry.expected_payment_date.asc())
            .limit(15)
        )
        comm_res = await self.db.execute(comm_query)
        promised_items = comm_res.all()

        for entry, rep, emp_user in promised_items:
            if not entry.customer_name or not entry.amount or not entry.expected_payment_date:
                continue

            exp_date = entry.expected_payment_date
            exp_date_str = str(exp_date)
            emp_prefix = f"[{emp_user.full_name or emp_user.username}] " if is_admin_all else ""
            cat_label = entry.category.replace("_", " ").title()
            proj_str = f" ({entry.project_name})" if entry.project_name else ""

            if exp_date == today:
                reminders.append(
                    ReminderItem(
                        id=f"commit-today-{entry.id}",
                        type="commitment_due_today",
                        severity="urgent",
                        title=f"{emp_prefix}Payment Promised Today: {entry.customer_name}",
                        message=f"৳{entry.amount:,.0f} ({cat_label}){proj_str} promised today by {entry.customer_name}. Follow up for collection.",
                        client_name=entry.customer_name,
                        category=cat_label,
                        date=exp_date_str,
                        link=f"/sales?tab=pipeline&search={quote_plus(entry.customer_name)}&edit_id={entry.id}",
                        action_label="Collect / Reschedule",
                    )
                )
            elif exp_date < today:
                overdue_days = (today - exp_date).days
                overdue_count += 1
                reminders.append(
                    ReminderItem(
                        id=f"commit-overdue-{entry.id}",
                        type="commitment_overdue",
                        severity="warning",
                        title=f"{emp_prefix}Overdue Promise: {entry.customer_name}",
                        message=f"৳{entry.amount:,.0f} was promised on {exp_date_str} ({overdue_days}d overdue) by {entry.customer_name}. Reschedule or follow up.",
                        client_name=entry.customer_name,
                        category=cat_label,
                        date=exp_date_str,
                        link=f"/sales?tab=pipeline&search={quote_plus(entry.customer_name)}&edit_id={entry.id}",
                        action_label="Review in Pipeline",
                    )
                )
            elif exp_date == today + timedelta(days=1):
                reminders.append(
                    ReminderItem(
                        id=f"commit-tomorrow-{entry.id}",
                        type="commitment_due",
                        severity="info",
                        title=f"{emp_prefix}Payment Due Tomorrow: {entry.customer_name}",
                        message=f"৳{entry.amount:,.0f} ({cat_label}){proj_str} promised for tomorrow by {entry.customer_name}.",
                        client_name=entry.customer_name,
                        category=cat_label,
                        date=exp_date_str,
                        link=f"/sales?tab=pipeline&search={quote_plus(entry.customer_name)}&edit_id={entry.id}",
                        action_label="View in Sales",
                    )
                )

        # Also include recent commitments (last 7 days) without an expected date
        no_date_filters = [
            SalesCollectionEntry.expected_payment_date.is_(None),
            SalesCollectionEntry.category.like("%commit%"),
            DailyActivityReport.report_date >= (today - timedelta(days=7)),
        ]
        if not is_admin_all:
            no_date_filters.append(DailyActivityReport.employee_id == emp_id)

        no_date_q = await self.db.execute(
            select(SalesCollectionEntry, User)
            .join(DailyActivityReport, SalesCollectionEntry.report_id == DailyActivityReport.id)
            .join(User, DailyActivityReport.employee_id == User.id)
            .where(*no_date_filters)
            .order_by(SalesCollectionEntry.id.desc())
            .limit(5)
        )
        for comm, emp_user in no_date_q.all():
            if comm.customer_name and comm.amount:
                cat_label = comm.category.replace("_", " ").title()
                emp_prefix = f"[{emp_user.full_name or emp_user.username}] " if is_admin_all else ""
                reminders.append(
                    ReminderItem(
                        id=f"commit-{comm.id}",
                        type="commitment_due",
                        severity="info",
                        title=f"{emp_prefix}Commitment: {comm.customer_name}",
                        message=f"{cat_label} of ৳{comm.amount:,.0f} recorded. Set promised date in Sales.",
                        client_name=comm.customer_name,
                        category=cat_label,
                        link=f"/sales?tab=pipeline&search={quote_plus(comm.customer_name)}&edit_id={comm.id}",
                        action_label="Set Date",
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
