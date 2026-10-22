"""AppSettings model — key/value store for configurable business settings."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class AppSettings(Base):
    """
    Key/value configuration table for business-configurable parameters.

    Organized by namespace to keep categories separate, e.g.:
        namespace="lead_categories"    key="high_potential"   value="High Potential"
        namespace="lead_status_labels" key="hp"               value="High Potential"
        namespace="lead_status_labels" key="p"                value="Potential"
        namespace="lead_status_labels" key="fub"              value="Follow-Up Booked"
        namespace="lead_status_labels" key="ni"               value="Not Interested"
        namespace="time_slots"         key="slot_10am_1pm"    value="10:00 AM – 1:00 PM"
        namespace="sales_categories"   key="new_sales"        value="New Sales"
        namespace="general"            key="business_timezone" value="Asia/Dhaka"

    Admins edit these via the /settings endpoints.
    Values are stored as JSON-encoded strings for flexibility.
    """

    __tablename__ = "app_settings"
    __table_args__ = (
        UniqueConstraint("namespace", "key", name="uq_settings_namespace_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    namespace: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<AppSettings {self.namespace!r}/{self.key!r}={self.value!r}>"
