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
    # Day 2 snapshot: HP=4, P=1, FUB=2, NI=3
    assert hp_cf["prev_hp"] == 4
    assert hp_cf["prev_p"] == 1
    assert hp_cf["prev_fub"] == 2
    assert hp_cf["prev_ni"] == 3

    # Dedicated carry-forward endpoint check
    cf_resp = await client.get(f"/api/v1/reports/{r3_id}/calls/carry-forward", headers=headers_emp)
    assert cf_resp.status_code == 200
    assert cf_resp.json()["categories"]["High Potential"]["prev_hp"] == 4


@pytest.mark.asyncio
async def test_carry_forward_no_previous_report(client: AsyncClient, employee_user):
    """When an employee creates their first report, carry forward baseline should be empty / 0 without error."""
    headers_emp = await emp_headers(client, employee_user)
    r_id = await _make_report(client, headers_emp, "2026-04-01")
    resp = await client.get(f"/api/v1/reports/{r_id}/calls", headers=headers_emp)
    assert resp.status_code == 200
    cf = resp.json().get("carry_forward")
    assert cf is not None
    assert cf["previous_report_date"] is None
    assert cf["categories"] == {}


@pytest.mark.asyncio
async def test_lead_transfer_and_call_independence(client: AsyncClient, employee_user):
    """
    Verify:
    1. Daily dials and connected calls are saved independently of lead stock.
    2. When a lead changes status (e.g. FUB -> HP), total stock remains constant.
    3. Next day accurately receives the updated totals without double-counting.
    """
    headers_emp = await emp_headers(client, employee_user)

    # Day 1: Baseline established
    # Facebook: 10 HP, 20 P, 30 FUB, 5 NI -> Total 65
    # Calls: 15 dialed, 6 connected
    r1_id = await _make_report(client, headers_emp, "2026-05-01")
    await client.put(
        f"/api/v1/reports/{r1_id}/calls",
        json={
            "entries": [
                {
                    "lead_category": "Facebook",
                    "slot_10am_1pm": 5,
                    "slot_2pm_5pm": 5,
                    "slot_5pm_6pm": 5,
                    "total_dialed": 15,
                    "total_connected": 6,
                    "lead_status_hp": 10,
                    "lead_status_p": 20,
                    "lead_status_fub": 30,
                    "lead_status_ni": 5,
                    "till_today_status": 65,
                }
            ]
        },
        headers=headers_emp,
    )

    # Day 2:
    # 2 leads moved from FUB -> HP (+2 HP, -2 FUB)
    # 1 lead moved from P -> NI (+1 NI, -1 P)
    # Today's calls: 20 dialed, 8 connected
    # Total stock must remain 65 (zero double counting)
    r2_id = await _make_report(client, headers_emp, "2026-05-02")
    cf_resp = await client.get(f"/api/v1/reports/{r2_id}/calls", headers=headers_emp)
    assert cf_resp.status_code == 200
    cf = cf_resp.json()["carry_forward"]
    fb_prev = cf["categories"]["Facebook"]
    assert fb_prev["prev_hp"] == 10
    assert fb_prev["prev_p"] == 20
    assert fb_prev["prev_fub"] == 30
    assert fb_prev["prev_ni"] == 5
    assert fb_prev["prev_till_today"] == 65

    # Save Day 2 updated totals
    await client.put(
        f"/api/v1/reports/{r2_id}/calls",
        json={
            "entries": [
                {
                    "lead_category": "Facebook",
                    "slot_10am_1pm": 8,
                    "slot_2pm_5pm": 8,
                    "slot_5pm_6pm": 4,
                    "total_dialed": 20,
                    "total_connected": 8,
                    "lead_status_hp": 12,  # 10 + 2
                    "lead_status_p": 19,   # 20 - 1
                    "lead_status_fub": 28, # 30 - 2
                    "lead_status_ni": 6,   # 5 + 1
                    "till_today_status": 65, # Stock unchanged
                }
            ]
        },
        headers=headers_emp,
    )

    # Day 3: Verify Day 3 loads Day 2's updated totals cleanly
    r3_id = await _make_report(client, headers_emp, "2026-05-03")
    r3_resp = await client.get(f"/api/v1/reports/{r3_id}/calls", headers=headers_emp)
    assert r3_resp.status_code == 200
    fb_d3_prev = r3_resp.json()["carry_forward"]["categories"]["Facebook"]
    assert fb_d3_prev["prev_hp"] == 12
    assert fb_d3_prev["prev_p"] == 19
    assert fb_d3_prev["prev_fub"] == 28
    assert fb_d3_prev["prev_ni"] == 6
    assert fb_d3_prev["prev_till_today"] == 65

