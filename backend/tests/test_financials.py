"""Tests for financial calculations and commitment vs collection separation."""
from __future__ import annotations

from decimal import Decimal

import pytest
from httpx import AsyncClient

from tests.conftest import emp_headers


async def _make_report(client, headers, date_str) -> int:
    r = await client.post("/api/v1/reports", json={"report_date": date_str}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _add_entry(client, headers, report_id, category, amount) -> dict:
    resp = await client.post(
        f"/api/v1/reports/{report_id}/sales-collections",
        json={"category": category, "amount": str(amount)},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_create_sales_collection_entry(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-04-01")
    entry = await _add_entry(client, headers, report_id, "new_sales", "500000.00")
    assert Decimal(entry["amount"]) == Decimal("500000.00")
    assert entry["category"] == "new_sales"


@pytest.mark.asyncio
async def test_report_summary_separates_collections_from_commitments(
    client: AsyncClient, employee_user
):
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-04-02")

    # Actual collection
    await _add_entry(client, headers, report_id, "new_sales_collection", "200000.00")
    # Commitment — must NOT be added to actual_collection
    await _add_entry(client, headers, report_id, "new_sales_commit_payment", "300000.00")

    resp = await client.get(f"/api/v1/reports/{report_id}/summary", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    actual = Decimal(body["total_actual_collection"])
    commitments = Decimal(body["total_sales_commitments"])
    assert actual == Decimal("200000.00")
    assert commitments == Decimal("300000.00")
    # They are separate — never summed
    assert actual + commitments == Decimal("500000.00")  # just verifying math


@pytest.mark.asyncio
async def test_tb_collection_separate_from_tb_commitment(
    client: AsyncClient, employee_user
):
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-04-03")

    await _add_entry(client, headers, report_id, "tb_collection", "100000.00")
    await _add_entry(client, headers, report_id, "total_token_to_booking_commit", "150000.00")

    resp = await client.get(f"/api/v1/reports/{report_id}/summary", headers=headers)
    body = resp.json()
    assert Decimal(body["total_tb_collection"]) == Decimal("100000.00")
    assert Decimal(body["total_tb_commitments"]) == Decimal("150000.00")


@pytest.mark.asyncio
async def test_emi_collection_counted_separately(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-04-04")

    await _add_entry(client, headers, report_id, "emi_collection", "75000.50")

    resp = await client.get(f"/api/v1/reports/{report_id}/summary", headers=headers)
    body = resp.json()
    assert Decimal(body["total_emi_collection"]) == Decimal("75000.50")


@pytest.mark.asyncio
async def test_amount_precision_preserved(client: AsyncClient, employee_user):
    """Decimal precision should be maintained — no floating-point drift."""
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-04-05")

    await _add_entry(client, headers, report_id, "new_sales_collection", "123456.78")
    await _add_entry(client, headers, report_id, "new_sales_collection", "0.22")

    resp = await client.get(f"/api/v1/reports/{report_id}/summary", headers=headers)
    body = resp.json()
    # 123456.78 + 0.22 = 123457.00 exactly
    assert Decimal(body["total_actual_collection"]) == Decimal("123457.00")


@pytest.mark.asyncio
async def test_negative_amount_rejected(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-04-06")
    resp = await client.post(
        f"/api/v1/reports/{report_id}/sales-collections",
        json={"category": "new_sales", "amount": "-1000.00"},
        headers=headers,
    )
    assert resp.status_code == 422
