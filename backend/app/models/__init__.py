"""SQLAlchemy database models for Sunset Dashboard."""
from __future__ import annotations

from app.models.user import User, UserRole
from app.models.report import DailyActivityReport, ReportStatus
from app.models.call_activity import CallActivityEntry, LeadCategory
from app.models.meeting_activity import MeetingActivityEntry, MeetingMetricType
from app.models.sales_collection import SalesCollectionEntry, SalesCategory
from app.models.targets import DailyTargets
from app.models.settings import AppSettings

__all__ = [
    "User",
    "UserRole",
    "DailyActivityReport",
    "ReportStatus",
    "CallActivityEntry",
    "LeadCategory",
    "MeetingActivityEntry",
    "MeetingMetricType",
    "SalesCollectionEntry",
    "SalesCategory",
    "DailyTargets",
    "AppSettings",
]
