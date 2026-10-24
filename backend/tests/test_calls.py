"""Tests for call activity entries and totals."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import emp_headers


async def _make_report(client, headers, date_str) -> int:
    r = await client.post("/api/v1/reports", json={"report_date": date_str}, headers=headers)
    return r.json()["id"]


@pytest.mark.asyncio
async def test_upsert_call_entries(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-03-01")

    entries = [
        {
            "lead_category": "High Potential",
            "slot_10am_1pm": 10,
            "slot_2pm_5pm": 15,
            "slot_5pm_6pm": 5,
            "total_connected": 20,
            "total_duration_minutes": 120,
            "lead_status_hp": 5,
            "lead_status_p": 3,
            "lead_status_fub": 2,
            "lead_status_ni": 10,
        }
    ]
    resp = await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": entries},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["entries"]) == 1
    e = body["entries"][0]
    # Backend should compute total_dialed = 10 + 15 + 5 = 30
    assert e["total_dialed"] == 30
    assert e["total_connected"] == 20


@pytest.mark.asyncio
async def test_call_slot_totals_calculated(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-03-02")

    entries = [
        {"lead_category": "Potential", "slot_10am_1pm": 5, "slot_2pm_5pm": 8, "slot_5pm_6pm": 2},
        {"lead_category": "Facebook", "slot_10am_1pm": 3, "slot_2pm_5pm": 6, "slot_5pm_6pm": 1},
    ]
    resp = await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": entries},
        headers=headers,
    )
    assert resp.status_code == 200
    totals = {e["lead_category"]: e["total_dialed"] for e in resp.json()["entries"]}
    assert totals["Potential"] == 15   # 5 + 8 + 2
    assert totals["Facebook"] == 10   # 3 + 6 + 1


@pytest.mark.asyncio
async def test_null_vs_zero_preserved(client: AsyncClient, employee_user):
    """Null fields must not be replaced with 0 by the backend."""
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-03-03")

    entries = [
        {
            "lead_category": "Fair Leads",
            "slot_10am_1pm": 0,       # explicit zero
            "slot_2pm_5pm": None,     # unreported
            "slot_5pm_6pm": None,     # unreported
            "total_dialed": 0,        # explicit zero
        }
    ]
    resp = await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": entries},
        headers=headers,
    )
    assert resp.status_code == 200
    e = resp.json()["entries"][0]
    assert e["slot_10am_1pm"] == 0
    assert e["slot_2pm_5pm"] is None
    assert e["slot_5pm_6pm"] is None


@pytest.mark.asyncio
async def test_upsert_replaces_previous_entries(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    report_id = await _make_report(client, headers, "2026-03-04")

    # First upsert with 2 categories
    await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": [
            {"lead_category": "A", "total_dialed": 10},
            {"lead_category": "B", "total_dialed": 5},
        ]},
        headers=headers,
    )
    # Second upsert with 1 category — should replace, not append
    resp = await client.put(
        f"/api/v1/reports/{report_id}/calls",
        json={"entries": [{"lead_category": "C", "total_dialed": 7}]},
        headers=headers,
    )
    categories = [e["lead_category"] for e in resp.json()["entries"]]
    assert categories == ["C"]


@pytest.mark.asyncio
async def test_lead_status_update_and_next_day_carry_forward(client: AsyncClient, employee_user):
    """
    Test the exact user requirement and example:
    If High Potential starts with 10 leads, the employee dials 8, connects with 6, and classifies 4 as HP and 2 as P:
      - HP remaining: 8 (10 - 2 moved to P)
      - P increases by 2
      - The 2 unconnected leads remain in HP
      - The next day starts with these updated totals.
    """
    headers_emp = await emp_headers(client, employee_user)

    # Day 1: 2026-06-01
    r1_id = await _make_report(client, headers_emp, "2026-06-01")
    await client.put(
        f"/api/v1/reports/{r1_id}/calls",
        json={
            "entries": [
                {
                    "lead_category": "high_potential",
                    "till_today_status": 10,
                    "slot_10am_1pm": 3,
                    "slot_2pm_5pm": 3,
                    "slot_5pm_6pm": 2,
                    "total_connected": 6,
                    "lead_status_hp": 4,
                    "lead_status_p": 2,
                    "lead_status_fub": 0,
                    "lead_status_ni": 0,
                },
                {
                    "lead_category": "potential",
                    "till_today_status": 20,
                    "slot_10am_1pm": 0,
                    "slot_2pm_5pm": 0,
                    "slot_5pm_6pm": 0,
                    "total_connected": 0,
                    "lead_status_hp": 0,
                    "lead_status_p": 0,
                    "lead_status_fub": 0,
                    "lead_status_ni": 0,
                },
            ]
        },
        headers=headers_emp,
    )

    # Day 2: 2026-06-02
    r2_id = await _make_report(client, headers_emp, "2026-06-02")
    resp2 = await client.get(f"/api/v1/reports/{r2_id}/calls", headers=headers_emp)
    assert resp2.status_code == 200
    cf = resp2.json().get("carry_forward")
    assert cf is not None
    assert cf["previous_report_date"] == "2026-06-01"

    # Verify High Potential has 8
    hp_cf = cf["categories"]["high_potential"]
    assert hp_cf["prev_till_today"] == 8

    # Verify Potential increased by 2 (20 + 2 = 22)
    p_cf = cf["categories"]["potential"]
    assert p_cf["prev_till_today"] == 22


@pytest.mark.asyncio
async def test_facebook_pool_conversion_carry_forward(client: AsyncClient, employee_user):
    """
    Test lead acquisition pool (e.g. Facebook):
    Facebook starts with 50 leads, connects with 6 (1 HP, 2 P, 3 FUB).
    Facebook remaining = 44 (50 - 6).
    Next day starts with Facebook = 44, HP gets +1, P gets +2, FUB gets +3.
    """
    headers_emp = await emp_headers(client, employee_user)

    r1_id = await _make_report(client, headers_emp, "2026-07-01")
    await client.put(
        f"/api/v1/reports/{r1_id}/calls",
        json={
            "entries": [
                {
                    "lead_category": "facebook",
                    "till_today_status": 50,
                    "slot_10am_1pm": 5,
                    "slot_2pm_5pm": 5,
                    "slot_5pm_6pm": 0,
                    "total_connected": 6,
                    "lead_status_hp": 1,
                    "lead_status_p": 2,
                    "lead_status_fub": 3,
                    "lead_status_ni": 0,
                },
                {
                    "lead_category": "high_potential",
                    "till_today_status": 10,
                },
            ]
        },
        headers=headers_emp,
    )

    r2_id = await _make_report(client, headers_emp, "2026-07-02")
    resp2 = await client.get(f"/api/v1/reports/{r2_id}/calls", headers=headers_emp)
    assert resp2.status_code == 200
    cf = resp2.json()["carry_forward"]

    # Facebook remaining = 50 - 6 = 44
    assert cf["categories"]["facebook"]["prev_till_today"] == 44
    # High Potential gets +1 = 11
    assert cf["categories"]["high_potential"]["prev_till_today"] == 11
    # Potential gets +2
    assert cf["categories"]["potential"]["prev_till_today"] == 2
    # Follow Up gets +3
    assert cf["categories"]["follow_up"]["prev_till_today"] == 3

