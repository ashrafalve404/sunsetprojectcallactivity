"""Sales and collection endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.sales_collection import (
    SalesCollectionEntryCreate,
    SalesCollectionEntryRead,
    SalesCollectionEntryUpdate,
    SalesCollectionListRead,
)
from app.services.sales_service import SalesService

router = APIRouter(tags=["Sales & Collection"])


@router.get(
    "/reports/{report_id}/sales-collections",
    response_model=SalesCollectionListRead,
)
async def get_sales_collections(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SalesService(db)
    entries = await svc.get_entries(report_id, current_user)
    return SalesCollectionListRead(report_id=report_id, entries=list(entries))


@router.post(
    "/reports/{report_id}/sales-collections",
    response_model=SalesCollectionEntryRead,
    status_code=201,
)
async def create_sales_collection(
    report_id: int,
    data: SalesCollectionEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SalesService(db)
    return await svc.create_entry(report_id, data, current_user)


@router.put(
    "/sales-collections/{entry_id}",
    response_model=SalesCollectionEntryRead,
)
async def update_sales_collection(
    entry_id: int,
    data: SalesCollectionEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SalesService(db)
    return await svc.update_entry(entry_id, data, current_user)


@router.delete("/sales-collections/{entry_id}", status_code=204)
async def delete_sales_collection(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = SalesService(db)
    await svc.delete_entry(entry_id, current_user)
