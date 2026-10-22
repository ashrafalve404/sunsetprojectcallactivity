"""SQLAlchemy database models for Sunset Dashboard."""
from __future__ import annotations

from app.models.user import User, UserRole
from app.models.report import DailyActivityReport, ReportStatus
from app.models.call_activity import CallActivityEntry
from app.models.meeting_activity import MeetingActivityEntry
from app.models.sales_collection import SalesCollectionEntry
from app.models.targets import DailyTargets
from app.models.settings import AppSettings

__all__ = [
    "User",
    "UserRole",
    "DailyActivityReport",
    "ReportStatus",
    "CallActivityEntry",
    "MeetingActivityEntry",
    "SalesCollectionEntry",
    "DailyTargets",
    "AppSettings",
]
