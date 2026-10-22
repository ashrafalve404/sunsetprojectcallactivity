"""Declarative base class shared by all models."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    """
    Common declarative base.
    All models inherit timestamped created_at / updated_at where appropriate.
    """
    pass
