"""
Full Demo Data Seeder for Sunset Group Call Activity & Sales Dashboard.

Seeds:
  1. Admin user: admin / ChangeMe123!
  2. Employee users: tanvir / password123, shakil / password123, nusrat / password123
  3. Global KPI targets & custom employee targets
  4. Historical and current Daily Activity Reports (Dhaka timezone)
  5. Detailed hourly call activity matrices (HP, P, FUB, NI)
  6. Client meeting & visit logs
  7. Real estate sales and cash collections (actual vs commitments)

Usage:
  python scripts/seed_demo_data.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

# Ensure backend root is on sys.path
sys.path.insert(0, ".")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.models.call_activity import CallActivityEntry
from app.models.meeting_activity import MeetingActivityEntry
from app.models.report import DailyActivityReport, ReportStatus
from app.models.sales_collection import SalesCollectionEntry
from app.models.targets import DailyTargets
from app.models.user import User, UserRole


def get_dhaka_date(offset_days: int = 0) -> date:
    # Dhaka is UTC+6
    dhaka_now = datetime.now(timezone.utc) + timedelta(hours=6)
    target_dt = dhaka_now + timedelta(days=offset_days)
    return target_dt.date()


async def seed_demo() -> None:
    print("=" * 60)
    print("  SUNSET GROUP DASHBOARD — DEMO DATA GENERATOR")
    print("=" * 60)

    engine = create_async_engine(settings.async_database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with SessionLocal() as db:
        # ── 1. USERS ──────────────────────────────────────────────────────────
        print("\n[1/5] Checking and creating user accounts...")
        users_to_create = [
            {
                "username": "admin",
                "email": "admin@sunsetgroup.com",
                "full_name": "Executive Admin",
                "password": "ChangeMe123!",
                "role": UserRole.ADMIN,
            },
            {
                "username": "tanvir",
                "email": "tanvir@sunsetgroup.com",
                "full_name": "Tanvir Rahman",
                "password": "password123",
                "role": UserRole.EMPLOYEE,
            },
            {
                "username": "shakil",
                "email": "shakil@sunsetgroup.com",
                "full_name": "Shakil Ahmed",
                "password": "password123",
                "role": UserRole.EMPLOYEE,
            },
            {
                "username": "nusrat",
                "email": "nusrat@sunsetgroup.com",
                "full_name": "Nusrat Jahan",
                "password": "password123",
                "role": UserRole.EMPLOYEE,
            },
        ]

        user_map: dict[str, User] = {}
        for udata in users_to_create:
            q = await db.execute(select(User).where(User.username == udata["username"]))
            existing = q.scalar_one_or_none()
            if not existing:
                u = User(
                    username=udata["username"],
                    email=udata["email"],
                    full_name=udata["full_name"],
                    password_hash=hash_password(udata["password"]),
                    role=udata["role"],
                    is_active=True,
                )
                db.add(u)
                await db.flush()
                user_map[udata["username"]] = u
                print(f"  + Created {udata['role'].value} account: {udata['username']} / {udata['password']}")
            else:
                user_map[udata["username"]] = existing
                print(f"  ✓ Existing account: {udata['username']}")

        await db.commit()

        # ── 2. TARGETS ────────────────────────────────────────────────────────
        print("\n[2/5] Seeding KPI targets...")
        t_query = await db.execute(select(DailyTargets).where(DailyTargets.employee_id.is_(None)))
        global_target = t_query.scalar_one_or_none()
        if not global_target:
            global_target = DailyTargets(
                employee_id=None,
                effective_from=get_dhaka_date(-30),
                dialed_calls_target=60,
                connected_calls_target=25,
                outdoor_visit_target=3,
                meeting_hours_target=Decimal("2.50"),
                sales_target=Decimal("1000000.00"),
                tb_target=Decimal("500000.00"),
            )
            db.add(global_target)
            print("  + Created Global Default Targets (60 Dialed, 25 Connected, 3 Visits, 1M Sales)")

        # Custom target for Tanvir
        tanvir_u = user_map.get("tanvir")
        if tanvir_u:
            tq2 = await db.execute(select(DailyTargets).where(DailyTargets.employee_id == tanvir_u.id))
            if not tq2.scalar_one_or_none():
                tanvir_target = DailyTargets(
                    employee_id=tanvir_u.id,
                    effective_from=get_dhaka_date(-30),
                    dialed_calls_target=75,
                    connected_calls_target=35,
                    outdoor_visit_target=4,
                    meeting_hours_target=Decimal("3.00"),
                    sales_target=Decimal("1500000.00"),
                    tb_target=Decimal("750000.00"),
                )
                db.add(tanvir_target)
                print("  + Created Custom Target for Tanvir Rahman (Senior Executive)")

        await db.commit()

        # ── 3. DAILY REPORTS (Past 3 Days + Today) ───────────────────────────
        print("\n[3/5] Seeding Daily Activity Reports...")
        employees_to_seed = [user_map["tanvir"], user_map["shakil"]]

        lead_categories = [
            ("high_potential", 25, 6, 8, 4, 3, 2, 1, 0),
            ("potential", 40, 8, 12, 5, 2, 4, 2, 1),
            ("facebook", 80, 15, 20, 10, 2, 3, 4, 3),
            ("fair_leads", 30, 7, 9, 3, 1, 2, 1, 1),
            ("follow_up", 50, 10, 14, 6, 2, 3, 3, 1),
            ("other_not_reached", 60, 4, 5, 3, 0, 1, 1, 5),
            ("new_cold_leads", 70, 12, 16, 8, 1, 2, 2, 4),
        ]

        meeting_metrics = [
            ("outdoor_visit_count", 12, 1, 1, 0, 2, None),
            ("outdoor_time_minutes", 420, 45, 60, 0, None, 105),
            ("indoor_cx_count", 18, 2, 1, 1, 4, None),
            ("indoor_cx_time_minutes", 360, 30, 25, 20, None, 75),
            ("mg_time_minutes", 120, 15, 10, 10, None, 35),
            ("team_meeting_time_minutes", 90, 20, 0, 0, None, 20),
        ]

        for emp in employees_to_seed:
            for day_offset in [-2, -1, 0]:
                report_d = get_dhaka_date(day_offset)
                rq = await db.execute(
                    select(DailyActivityReport).where(
                        DailyActivityReport.employee_id == emp.id,
                        DailyActivityReport.report_date == report_d,
                    )
                )
                existing_report = rq.scalar_one_or_none()
                if existing_report:
                    print(f"  ✓ Report for {emp.full_name} on {report_d} exists (ID: {existing_report.id})")
                    continue

                is_today = (day_offset == 0)
                status = ReportStatus.DRAFT if is_today else ReportStatus.SUBMITTED
                submitted_time = None if is_today else datetime.now(timezone.utc) - timedelta(days=abs(day_offset))

                report = DailyActivityReport(
                    employee_id=emp.id,
                    report_date=report_d,
                    status=status,
                    submitted_at=submitted_time,
                    notes=f"Operational sales reporting for {report_d}.",
                )
                db.add(report)
                await db.flush()

                # Add Call Activities
                for cat_key, till_today, s1, s2, s3, hp, p, fub, ni in lead_categories:
                    tot_dialed = s1 + s2 + s3
                    tot_conn = hp + p + fub
                    call_entry = CallActivityEntry(
                        report_id=report.id,
                        lead_category=cat_key,
                        till_today_status=till_today,
                        slot_10am_1pm=s1,
                        slot_2pm_5pm=s2,
                        slot_5pm_6pm=s3,
                        total_dialed=tot_dialed,
                        total_connected=tot_conn,
                        total_duration_minutes=tot_conn * 4,
                        lead_status_hp=hp,
                        lead_status_p=p,
                        lead_status_fub=fub,
                        lead_status_ni=ni,
                    )
                    db.add(call_entry)

                # Add Meetings
                for m_type, till_val, s1, s2, s3, tot_cnt, tot_dur in meeting_metrics:
                    meet_entry = MeetingActivityEntry(
                        report_id=report.id,
                        activity_type=m_type,
                        till_today_value=till_val,
                        slot_10am_1pm=s1,
                        slot_2pm_5pm=s2,
                        slot_5pm_6pm=s3,
                        total_count=tot_cnt,
                        total_duration_minutes=tot_dur,
                        notes="Completed as scheduled",
                    )
                    db.add(meet_entry)

                # Add Financial Sales & Collections
                if day_offset == -2:
                    db.add(
                        SalesCollectionEntry(
                            report_id=report.id,
                            category="tb_collection",
                            amount=100000.00,
                            customer_name="Mr. Farhan Chowdhury",
                            reference="MR-2026-081",
                            notes="Token booking advance for Plot #45",
                            payment_sequence=1,
                        )
                    )
                    db.add(
                        SalesCollectionEntry(
                            report_id=report.id,
                            category="total_token_to_booking_commit",
                            amount=300000.00,
                            customer_name="Mr. Farhan Chowdhury",
                            reference="Commitment Cheque #8812",
                            notes="Remaining TB balance due next week",
                            payment_sequence=2,
                        )
                    )
                elif day_offset == -1:
                    db.add(
                        SalesCollectionEntry(
                            report_id=report.id,
                            category="new_sales_collection",
                            amount=450000.00,
                            customer_name="Engr. Rezaul Karim",
                            reference="PO-5491 / City Bank",
                            notes="Initial down payment on Suite 7B",
                            payment_sequence=1,
                        )
                    )
                    db.add(
                        SalesCollectionEntry(
                            report_id=report.id,
                            category="emi_collection",
                            amount=65000.00,
                            customer_name="Dr. Sabrina Islam",
                            reference="Online EFTN #9021",
                            notes="Apartment 12A Monthly Installment #3",
                            payment_sequence=3,
                        )
                    )
                    db.add(
                        SalesCollectionEntry(
                            report_id=report.id,
                            category="new_sales_commit_payment",
                            amount=800000.00,
                            customer_name="Brig. Gen. M. Rahman",
                            reference="Letter of Commitment",
                            notes="Commercial space 1st installment commitment",
                            payment_sequence=1,
                        )
                    )
                else:
                    # Today's draft transactions
                    db.add(
                        SalesCollectionEntry(
                            report_id=report.id,
                            category="new_sales_collection",
                            amount=200000.00,
                            customer_name="Advocate M. Anisuzzaman",
                            reference="Cheque #99412 - DBBL",
                            notes="Booking deposit for 3-bed luxury flat",
                            payment_sequence=1,
                        )
                    )

                print(f"  + Generated full report for {emp.full_name} on {report_d} [{status.value}]")

        await db.commit()

    await engine.dispose()
    print("\n" + "=" * 60)
    print("  SEEDING COMPLETE! ALL SYSTEMS READY.")
    print("=" * 60)
    print("\nDemo Login Credentials:")
    print("  1. Administrator Account:")
    print("     Username : admin")
    print("     Password : ChangeMe123!")
    print("\n  2. Sales Employee Accounts:")
    print("     Username : tanvir")
    print("     Password : password123")
    print("     -- or --")
    print("     Username : shakil")
    print("     Password : password123")
    print("\nDashboard URL: http://localhost:3000")
    print("API Docs URL : http://localhost:8000/docs\n")


if __name__ == "__main__":
    asyncio.run(seed_demo())
