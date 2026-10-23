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
async def test_carry_forward_multi_day_and_isolation(client: AsyncClient, employee_user, admin_user):
    headers_emp = await emp_headers(client, employee_user)

    # Day 1: Employee reports 2 HP and 3 P
    r1_id = await _make_report(client, headers_emp, "2026-03-10")
    await client.put(
        f"/api/v1/reports/{r1_id}/calls",
        json={
            "entries": [
                {
                    "lead_category": "High Potential",
                    "till_today_status": 50,
                    "lead_status_hp": 2,
                    "lead_status_p": 3,
                    "lead_status_fub": 1,
                    "lead_status_ni": 4,
                }
            ]
        },
        headers=headers_emp,
    )

    # Day 2: Employee reports 4 more HP and 1 more P
    r2_id = await _make_report(client, headers_emp, "2026-03-11")
    await client.put(
        f"/api/v1/reports/{r2_id}/calls",
        json={
            "entries": [
                {
                    "lead_category": "High Potential",
                    "till_today_status": 50,
                    "lead_status_hp": 4,
                    "lead_status_p": 1,
                    "lead_status_fub": 2,
                    "lead_status_ni": 3,
                }
            ]
        },
        headers=headers_emp,
    )

    # Day 3: Employee creates report on 2026-03-12
    r3_id = await _make_report(client, headers_emp, "2026-03-12")
    resp = await client.get(f"/api/v1/reports/{r3_id}/calls", headers=headers_emp)
    assert resp.status_code == 200
    cf = resp.json().get("carry_forward")
    assert cf is not None
    assert cf["previous_report_date"] == "2026-03-11"
    assert cf["employee_id"] == employee_user.id

    hp_cf = cf["categories"]["High Potential"]
    assert hp_cf["prev_till_today"] == 50
    # Day 1 (2) + Day 2 (4) = 6
    assert hp_cf["prev_hp"] == 6
    # Day 1 (3) + Day 2 (1) = 4
    assert hp_cf["prev_p"] == 4
    # Day 1 (1) + Day 2 (2) = 3
    assert hp_cf["prev_fub"] == 3
    # Day 1 (4) + Day 2 (3) = 7
    assert hp_cf["prev_ni"] == 7

    # Dedicated carry-forward endpoint check
    cf_resp = await client.get(f"/api/v1/reports/{r3_id}/calls/carry-forward", headers=headers_emp)
    assert cf_resp.status_code == 200
    assert cf_resp.json()["categories"]["High Potential"]["prev_hp"] == 6
