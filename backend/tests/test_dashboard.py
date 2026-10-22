"""Tests for dashboard aggregation and date filtering."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import emp_headers, admin_headers


async def _make_report(client, headers, date_str) -> int:
    r = await client.post("/api/v1/reports", json={"report_date": date_str}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_dashboard_summary_aggregates_multiple_reports(
    client: AsyncClient, employee_user
):
    headers = await emp_headers(client, employee_user)

    # Create 2 reports with call data
    for date_str, dialed in [("2026-05-01", 30), ("2026-05-02", 20)]:
        rid = await _make_report(client, headers, date_str)
        await client.put(
            f"/api/v1/reports/{rid}/calls",
            json={"entries": [{"lead_category": "HP", "total_dialed": dialed, "total_connected": dialed // 2}]},
            headers=headers,
        )

    resp = await client.get(
        "/api/v1/dashboard/summary",
        params={"date_from": "2026-05-01", "date_to": "2026-05-02"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_dialed"] == 50
    assert body["total_connected"] == 25


@pytest.mark.asyncio
async def test_dashboard_date_filter_excludes_out_of_range(
    client: AsyncClient, employee_user
):
    headers = await emp_headers(client, employee_user)

    rid = await _make_report(client, headers, "2026-06-10")
    await client.put(
        f"/api/v1/reports/{rid}/calls",
        json={"entries": [{"lead_category": "X", "total_dialed": 50}]},
        headers=headers,
    )

    # Query only June 1–5 — report is June 10, should not appear
    resp = await client.get(
        "/api/v1/dashboard/summary",
        params={"date_from": "2026-06-01", "date_to": "2026-06-05"},
        headers=headers,
    )
    assert resp.json()["total_dialed"] == 0
    assert resp.json()["report_count"] == 0


@pytest.mark.asyncio
async def test_connection_rate_calculated(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    rid = await _make_report(client, headers, "2026-07-01")
    await client.put(
        f"/api/v1/reports/{rid}/calls",
        json={"entries": [{"lead_category": "Y", "total_dialed": 100, "total_connected": 40}]},
        headers=headers,
    )
    resp = await client.get(
        "/api/v1/dashboard/summary",
        params={"date_from": "2026-07-01", "date_to": "2026-07-01"},
        headers=headers,
    )
    from decimal import Decimal
    rate = Decimal(resp.json()["connection_rate_pct"])
    assert rate == Decimal("40.00")


@pytest.mark.asyncio
async def test_connection_rate_none_when_no_dialed(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    resp = await client.get(
        "/api/v1/dashboard/summary",
        params={"date_from": "2026-08-01", "date_to": "2026-08-01"},
        headers=headers,
    )
    body = resp.json()
    # Either no report or total_dialed=0 → connection_rate_pct is None or absent
    rate = body.get("connection_rate_pct")
    assert rate is None or rate == "0"
