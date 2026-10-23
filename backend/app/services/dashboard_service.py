"""
DashboardService — aggregate calculations for the dashboard API.

All calculations are derived from saved detail records.
Client-submitted totals are never trusted for dashboard figures.

FORMULAS:
  connection_rate_pct = (total_connected / total_dialed * 100).quantize(Decimal("0.01"))
    Returns None if total_dialed == 0.
  achievement_pct = (actual / target * 100).quantize(Decimal("0.01"))
    Returns None if target is None or target == 0.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.call_activity import CallActivityEntry
from app.models.meeting_activity import MeetingActivityEntry
from app.models.report import DailyActivityReport, ReportStatus
from app.models.sales_collection import SalesCollectionEntry
from app.repositories.call_repo import CallActivityRepository
from app.repositories.meeting_repo import MeetingActivityRepository
from app.repositories.report_repo import ReportRepository
from app.repositories.sales_repo import SalesCollectionRepository
from app.repositories.targets_repo import TargetsRepository
from app.schemas.dashboard import (
    DashboardSummary,
    LeadCategoryBreakdown,
    ReportSummary,
    SlotBreakdown,
    TargetAchievement,
    EmployeeLeaderboardItem,
    KPIChampion,
    PerformanceLeaderboardResponse,
)
from app.services.sales_service import SalesService


class DashboardService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.report_repo = ReportRepository(db)
        self.call_repo = CallActivityRepository(db)
        self.meeting_repo = MeetingActivityRepository(db)
        self.sales_repo = SalesCollectionRepository(db)
        self.targets_repo = TargetsRepository(db)

    async def get_report_summary(
        self, report_id: int
    ) -> ReportSummary:
        """Compute full summary for one daily report."""
        from sqlalchemy.orm import selectinload

        result = await self.db.execute(
            select(DailyActivityReport)
            .where(DailyActivityReport.id == report_id)
            .options(
                selectinload(DailyActivityReport.employee),
                selectinload(DailyActivityReport.call_entries),
                selectinload(DailyActivityReport.meeting_entries),
                selectinload(DailyActivityReport.sales_collection_entries),
            )
        )
        report = result.scalar_one_or_none()
        if not report:
            return None

        call_entries = report.call_entries
        meeting_entries = report.meeting_entries
        sales_entries = report.sales_collection_entries

        # ── Call totals ───────────────────────────────────────────────────────
        total_dialed = _sum_int(call_entries, "total_dialed")
        total_connected = _sum_int(call_entries, "total_connected")
        total_call_dur = _sum_int(call_entries, "total_duration_minutes")
        call_slot_10 = _sum_int(call_entries, "slot_10am_1pm")
        call_slot_2 = _sum_int(call_entries, "slot_2pm_5pm")
        call_slot_5 = _sum_int(call_entries, "slot_5pm_6pm")

        connection_rate = _calc_rate(total_connected, total_dialed)

        # ── Lead category breakdown ───────────────────────────────────────────
        lead_breakdown = [
            LeadCategoryBreakdown(
                lead_category=e.lead_category,
                total_dialed=e.total_dialed,
                total_connected=e.total_connected,
                total_duration_minutes=e.total_duration_minutes,
                lead_status_hp=e.lead_status_hp,
                lead_status_p=e.lead_status_p,
                lead_status_fub=e.lead_status_fub,
                lead_status_ni=e.lead_status_ni,
            )
            for e in call_entries
        ]

        # ── Meeting totals ────────────────────────────────────────────────────
        # Visit count activities (non-time): activity_type contains "visit" or "CX"
        total_outdoor_visits = 0
        total_meeting_dur = 0
        for me in meeting_entries:
            if me.total_count is not None:
                total_outdoor_visits += me.total_count
            if me.total_duration_minutes is not None:
                total_meeting_dur += me.total_duration_minutes

        # ── Financial totals ─────────────────────────────────────────────────
        fin = SalesService.calc_totals(sales_entries)

        # ── Targets ───────────────────────────────────────────────────────────
        target = await self.targets_repo.get_effective_target(
            report.report_date, report.employee_id
        )

        def ta(actual_int, target_val) -> TargetAchievement:
            actual = Decimal(str(actual_int))
            t = Decimal(str(target_val)) if target_val is not None else None
            return TargetAchievement(
                actual=actual,
                target=t,
                achievement_pct=_calc_rate(actual, t) if t else None,
            )

        dialed_ta = ta(total_dialed, target.dialed_calls_target if target else None)
        connected_ta = ta(total_connected, target.connected_calls_target if target else None)
        visit_ta = ta(total_outdoor_visits, target.outdoor_visit_target if target else None)
        sales_actual = fin["total_new_sales"]
        sales_ta = TargetAchievement(
            actual=sales_actual,
            target=Decimal(str(target.sales_target)) if target and target.sales_target else None,
            achievement_pct=(
                _calc_rate(sales_actual, Decimal(str(target.sales_target)))
                if target and target.sales_target else None
            ),
        )
        tb_actual = fin["total_tb_collection"]
        tb_ta = TargetAchievement(
            actual=tb_actual,
            target=Decimal(str(target.tb_target)) if target and target.tb_target else None,
            achievement_pct=(
                _calc_rate(tb_actual, Decimal(str(target.tb_target)))
                if target and target.tb_target else None
            ),
        )
        meeting_actual_h = Decimal(str(total_meeting_dur)) / Decimal("60")
        meeting_ta = TargetAchievement(
            actual=meeting_actual_h.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            target=Decimal(str(target.meeting_hours_target)) if target and target.meeting_hours_target else None,
            achievement_pct=(
                _calc_rate(meeting_actual_h, Decimal(str(target.meeting_hours_target)))
                if target and target.meeting_hours_target else None
            ),
        )

        return ReportSummary(
            report_id=report.id,
            report_date=report.report_date,
            employee_id=report.employee_id,
            employee_name=report.employee.full_name if report.employee else None,
            total_dialed=total_dialed,
            total_connected=total_connected,
            connection_rate_pct=connection_rate,
            total_call_duration_minutes=total_call_dur,
            call_slots=SlotBreakdown(
                slot_10am_1pm=call_slot_10,
                slot_2pm_5pm=call_slot_2,
                slot_5pm_6pm=call_slot_5,
            ),
            total_outdoor_visits=total_outdoor_visits,
            total_meeting_duration_minutes=total_meeting_dur,
            total_new_sales=fin["total_new_sales"],
            total_actual_collection=fin["total_actual_collection"],
            total_sales_commitments=fin["total_sales_commitments"],
            total_tb_collection=fin["total_tb_collection"],
            total_tb_commitments=fin["total_tb_commitments"],
            total_emi_collection=fin["total_emi_collection"],
            dialed_calls=dialed_ta,
            connected_calls=connected_ta,
            outdoor_visits=visit_ta,
            sales=sales_ta,
            tb=tb_ta,
            meeting_hours=meeting_ta,
            lead_category_breakdown=lead_breakdown,
        )

    async def get_dashboard_summary(
        self,
        date_from: date,
        date_to: date,
        employee_id: Optional[int] = None,
    ) -> DashboardSummary:
        """Aggregate across multiple reports for the dashboard."""
        from sqlalchemy.orm import selectinload

        stmt = (
            select(DailyActivityReport)
            .options(
                selectinload(DailyActivityReport.call_entries),
                selectinload(DailyActivityReport.meeting_entries),
                selectinload(DailyActivityReport.sales_collection_entries),
            )
            .where(
                DailyActivityReport.report_date >= date_from,
                DailyActivityReport.report_date <= date_to,
            )
        )
        if employee_id is not None:
            stmt = stmt.where(DailyActivityReport.employee_id == employee_id)

        result = await self.db.execute(stmt)
        reports = result.scalars().all()

        total_dialed = 0
        total_connected = 0
        total_call_dur = 0
        total_outdoor_visits = 0
        total_indoor_cx = 0
        total_meeting_dur = 0
        submitted_reports = 0

        slot_breakdown: dict[str, dict[str, int]] = {
            "10_to_1": {"dialed": 0},
            "2_to_5": {"dialed": 0},
            "5_to_6": {"dialed": 0},
        }

        agg_fin: dict[str, Decimal] = {
            "total_new_sales": Decimal("0"),
            "total_actual_collection": Decimal("0"),
            "total_sales_commitments": Decimal("0"),
            "total_tb_collection": Decimal("0"),
            "total_tb_commitments": Decimal("0"),
            "total_emi_collection": Decimal("0"),
        }
        category_map: dict[str, LeadCategoryBreakdown] = {}
        by_category_dict: dict[str, dict[str, int]] = {}

        for report in reports:
            if report.status == ReportStatus.SUBMITTED:
                submitted_reports += 1

            for ce in report.call_entries:
                slot1 = ce.slot_10am_1pm or 0
                slot2 = ce.slot_2pm_5pm or 0
                slot3 = ce.slot_5pm_6pm or 0
                ce_dialed = ce.total_dialed if ce.total_dialed is not None else (slot1 + slot2 + slot3)
                ce_hp = ce.lead_status_hp or 0
                ce_p = ce.lead_status_p or 0
                ce_fub = ce.lead_status_fub or 0
                ce_connected = ce.total_connected if ce.total_connected is not None else (ce_hp + ce_p + ce_fub)
                ce_dur = ce.total_duration_minutes or 0

                total_dialed += ce_dialed
                total_connected += ce_connected
                total_call_dur += ce_dur

                slot_breakdown["10_to_1"]["dialed"] += slot1
                slot_breakdown["2_to_5"]["dialed"] += slot2
                slot_breakdown["5_to_6"]["dialed"] += slot3

                cat_stat = by_category_dict.setdefault(
                    ce.lead_category, {"dialed": 0, "connected": 0, "duration_min": 0}
                )
                cat_stat["dialed"] += ce_dialed
                cat_stat["connected"] += ce_connected
                cat_stat["duration_min"] += ce_dur

                lb = category_map.setdefault(
                    ce.lead_category,
                    LeadCategoryBreakdown(lead_category=ce.lead_category),
                )
                _add_opt(lb, "total_dialed", ce_dialed)
                _add_opt(lb, "total_connected", ce_connected)
                _add_opt(lb, "total_duration_minutes", ce_dur)
                _add_opt(lb, "lead_status_hp", ce.lead_status_hp)
                _add_opt(lb, "lead_status_p", ce.lead_status_p)
                _add_opt(lb, "lead_status_fub", ce.lead_status_fub)
                _add_opt(lb, "lead_status_ni", ce.lead_status_ni)

            for me in report.meeting_entries:
                s_sum = (me.slot_10am_1pm or 0) + (me.slot_2pm_5pm or 0) + (me.slot_5pm_6pm or 0)
                val = me.total_count if me.total_count is not None else s_sum
                act_lower = (me.activity_type or "").lower()
                if "outdoor_visit" in act_lower or "outdoor visit" in act_lower or "visit" in act_lower:
                    total_outdoor_visits += val
                elif "indoor_cx" in act_lower or "indoor cx" in act_lower or "cx" in act_lower:
                    total_indoor_cx += val

                dur = me.total_duration_minutes if me.total_duration_minutes is not None else s_sum
                if "time" in act_lower or "duration" in act_lower or "minute" in act_lower:
                    total_meeting_dur += dur

            fin = SalesService.calc_totals(report.sales_collection_entries)
            agg_fin["total_new_sales"] += fin["total_new_sales"]
            agg_fin["total_actual_collection"] += fin["total_actual_collection"]
            agg_fin["total_sales_commitments"] += fin["total_sales_commitments"]
            agg_fin["total_tb_collection"] += fin["total_tb_collection"]
            agg_fin["total_tb_commitments"] += fin["total_tb_commitments"]
            agg_fin["total_emi_collection"] += fin["total_emi_collection"]

        tot_commitments = agg_fin["total_sales_commitments"] + agg_fin["total_tb_commitments"]

        return DashboardSummary(
            date_from=date_from,
            date_to=date_to,
            period_start=date_from,
            period_end=date_to,
            employee_id=employee_id,
            report_count=len(reports),
            total_reports=len(reports),
            submitted_reports=submitted_reports,
            total_dialed=total_dialed,
            total_calls_dialed=total_dialed,
            total_connected=total_connected,
            total_calls_connected=total_connected,
            connection_rate_pct=_calc_rate(total_connected, total_dialed),
            total_call_duration_minutes=total_call_dur,
            total_outdoor_visits=total_outdoor_visits,
            total_indoor_cx=total_indoor_cx,
            total_meeting_duration_minutes=total_meeting_dur,
            total_meeting_time_minutes=total_meeting_dur,
            total_new_sales=agg_fin["total_new_sales"],
            total_actual_collection=agg_fin["total_actual_collection"],
            actual_collection_bdt=agg_fin["total_actual_collection"],
            total_sales_commitments=agg_fin["total_sales_commitments"],
            total_tb_collection=agg_fin["total_tb_collection"],
            tb_collection_bdt=agg_fin["total_tb_collection"],
            total_tb_commitments=agg_fin["total_tb_commitments"],
            tb_commitments_bdt=agg_fin["total_tb_commitments"],
            total_emi_collection=agg_fin["total_emi_collection"],
            emi_collection_bdt=agg_fin["total_emi_collection"],
            commitments_bdt=tot_commitments,
            by_slot=slot_breakdown,
            by_category=by_category_dict,
            lead_category_breakdown=list(category_map.values()),
        )

    async def get_performance_leaderboard(
        self,
        date_from: date,
        date_to: date,
        employee_id: Optional[int] = None,
    ) -> PerformanceLeaderboardResponse:
        from app.models.user import User, UserRole

        # 1. Fetch active employees
        user_query = select(User).where(User.is_active.is_(True))
        if employee_id:
            user_query = user_query.where(User.id == employee_id)
        else:
            user_query = user_query.where(User.role == UserRole.EMPLOYEE)

        users_res = await self.db.execute(user_query.order_by(User.id))
        employees = users_res.scalars().all()

        rankings: list[EmployeeLeaderboardItem] = []

        for emp in employees:
            target = await self.targets_repo.get_effective_target(date_to, emp.id)
            dialed_tgt = (target.dialed_calls_target if target and target.dialed_calls_target else 60)
            connected_tgt = (target.connected_calls_target if target and target.connected_calls_target else 25)
            outdoor_tgt = (target.outdoor_visit_target if target and target.outdoor_visit_target else 3)
            collection_tgt = float(target.sales_target if target and target.sales_target else (target.tb_target if target and target.tb_target else 500000))

            summary = await self.get_dashboard_summary(date_from, date_to, emp.id)
            dialed = summary.total_calls_dialed
            connected = summary.total_calls_connected
            visits = summary.total_outdoor_visits
            meet_dur = summary.total_meeting_time_minutes
            colls = float(summary.actual_collection_bdt)

            dialed_pct = min(200.0, round((dialed / dialed_tgt * 100), 1)) if dialed_tgt > 0 else 100.0
            connected_pct = min(200.0, round((connected / connected_tgt * 100), 1)) if connected_tgt > 0 else 100.0
            outdoor_pct = min(200.0, round((visits / outdoor_tgt * 100), 1)) if outdoor_tgt > 0 else 100.0
            colls_pct = min(200.0, round((colls / collection_tgt * 100), 1)) if collection_tgt > 0 else 100.0

            overall = round((dialed_pct * 0.25 + connected_pct * 0.35 + outdoor_pct * 0.20 + colls_pct * 0.20), 1)

            if overall >= 100.0:
                status = "achieved"
            elif overall >= 75.0:
                status = "on_track"
            elif overall >= 50.0:
                status = "needs_attention"
            else:
                status = "behind_pace"

            rankings.append(
                EmployeeLeaderboardItem(
                    rank=0,
                    employee_id=emp.id,
                    employee_name=emp.full_name,
                    username=emp.username,
                    reports_count=summary.total_reports,
                    dialed_calls=dialed,
                    dialed_target=dialed_tgt,
                    dialed_pct=dialed_pct,
                    connected_calls=connected,
                    connected_target=connected_tgt,
                    connected_pct=connected_pct,
                    outdoor_visits=visits,
                    outdoor_target=outdoor_tgt,
                    outdoor_pct=outdoor_pct,
                    meeting_minutes=meet_dur,
                    actual_collections=colls,
                    collection_target=collection_tgt,
                    collection_pct=colls_pct,
                    overall_score_pct=overall,
                    status=status,
                )
            )

        rankings.sort(key=lambda r: (r.overall_score_pct, r.connected_calls, r.dialed_calls), reverse=True)
        for idx, item in enumerate(rankings, 1):
            item.rank = idx

        champions: list[KPIChampion] = []
        if rankings and employee_id is None:
            top_caller = max(rankings, key=lambda r: r.dialed_calls)
            top_conn = max(rankings, key=lambda r: r.connected_calls)
            top_visits = max(rankings, key=lambda r: r.outdoor_visits)
            top_closer = max(rankings, key=lambda r: r.actual_collections)

            champions = [
                KPIChampion(
                    title="Top Caller",
                    metric="Most Dialed Calls",
                    employee_name=top_caller.employee_name,
                    value=f"{top_caller.dialed_calls} calls ({top_caller.dialed_pct}%)",
                ),
                KPIChampion(
                    title="Top Connector",
                    metric="Connected Conversations",
                    employee_name=top_conn.employee_name,
                    value=f"{top_conn.connected_calls} connected ({top_conn.connected_pct}%)",
                ),
                KPIChampion(
                    title="Meeting Star",
                    metric="Client Outdoor Visits",
                    employee_name=top_visits.employee_name,
                    value=f"{top_visits.outdoor_visits} visits ({top_visits.outdoor_pct}%)",
                ),
                KPIChampion(
                    title="Top Closer",
                    metric="Actual Collections",
                    employee_name=top_closer.employee_name,
                    value=f"৳{top_closer.actual_collections:,.0f} ({top_closer.collection_pct}%)",
                ),
            ]

        avg_team_score = round(sum(r.overall_score_pct for r in rankings) / len(rankings), 1) if rankings else 0.0

        return PerformanceLeaderboardResponse(
            period_start=date_from,
            period_end=date_to,
            team_overall_score_pct=avg_team_score,
            champions=champions,
            rankings=rankings,
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sum_int(entries, field: str) -> int:
    return sum(getattr(e, field) or 0 for e in entries)


def _calc_rate(numerator, denominator) -> Optional[Decimal]:
    try:
        n = Decimal(str(numerator))
        d = Decimal(str(denominator))
        if d == 0:
            return None
        return (n / d * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return None


def _add_opt(obj, field: str, value) -> None:
    """Add an optional integer to a LeadCategoryBreakdown field."""
    if value is not None:
        current = getattr(obj, field)
        setattr(obj, field, (current or 0) + value)
