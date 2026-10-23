"""Pydantic schemas for SalesCollectionEntry."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class SalesCollectionEntryBase(BaseModel):
    category: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=300)
    amount: Decimal = Field(..., decimal_places=2, ge=Decimal("0"))
    payment_sequence: Optional[int] = Field(None, ge=1)
    customer_name: Optional[str] = Field(None, max_length=500)
    payment_method: Optional[str] = Field(None, max_length=50)
    reference: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None

    @field_validator("amount", mode="before")
    @classmethod
    def parse_amount(cls, v):
        return Decimal(str(v))


class SalesCollectionEntryCreate(SalesCollectionEntryBase):
    pass


class SalesCollectionEntryUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=300)
    amount: Optional[Decimal] = Field(None, decimal_places=2, ge=Decimal("0"))
    payment_sequence: Optional[int] = Field(None, ge=1)
    customer_name: Optional[str] = Field(None, max_length=500)
    payment_method: Optional[str] = Field(None, max_length=50)
    reference: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None



    @field_validator("amount", mode="before")
    @classmethod
    def parse_amount(cls, v):
        if v is None:
            return v
        return Decimal(str(v))


class SalesCollectionEntryRead(SalesCollectionEntryBase):
    id: int
    report_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SalesCollectionListRead(BaseModel):
    report_id: int
    entries: List[SalesCollectionEntryRead]
