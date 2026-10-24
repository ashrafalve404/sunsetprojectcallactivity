import pytest
from httpx import AsyncClient
from datetime import date, timedelta
from tests.conftest import admin_headers


@pytest.mark.asyncio
async def test_commitment_creation_and_reschedule_tracking(
    client: AsyncClient, admin_user
):
    headers = await admin_headers(client, admin_user)

    # 1. Create a daily report
    today = date.today().isoformat()
    r = await client.post(
        "/api/v1/reports",
        json={"report_date": today},
        headers=headers,
    )
    assert r.status_code == 201
    report_id = r.json()["id"]

    # 2. Add a commitment transaction with future promised date
    first_date = (date.today() + timedelta(days=10)).isoformat()
    entry_resp = await client.post(
        f"/api/v1/reports/{report_id}/sales-collections",
        json={
            "category": "new_sales_commit_payment_1",
            "amount": 250000.00,
            "customer_name": "Tariqul Islam",
            "expected_payment_date": first_date,
            "payment_method": "cheque",
            "notes": "Promised down payment",
        },
        headers=headers,
    )
    assert entry_resp.status_code == 201
    entry_data = entry_resp.json()
    entry_id = entry_data["id"]
    assert entry_data["expected_payment_date"] == first_date
    assert entry_data["reschedule_count"] == 0
    assert entry_data["reschedule_history"] is None or entry_data["reschedule_history"] == []

    # 3. Client shifts date 1st time
    second_date = (date.today() + timedelta(days=20)).isoformat()
    upd_resp_1 = await client.put(
        f"/api/v1/sales-collections/{entry_id}",
        json={
            "expected_payment_date": second_date,
            "reschedule_reason": "Bank loan sanction delayed",
        },
        headers=headers,
    )
    assert upd_resp_1.status_code == 200
    upd_data_1 = upd_resp_1.json()
    assert upd_data_1["expected_payment_date"] == second_date
    assert upd_data_1["reschedule_count"] == 1
    assert len(upd_data_1["reschedule_history"]) == 1
    assert upd_data_1["reschedule_history"][0]["old_date"] == first_date
    assert upd_data_1["reschedule_history"][0]["new_date"] == second_date
    assert upd_data_1["reschedule_history"][0]["reason"] == "Bank loan sanction delayed"

    # 4. Client shifts date 2nd time
    third_date = (date.today() + timedelta(days=35)).isoformat()
    upd_resp_2 = await client.put(
        f"/api/v1/sales-collections/{entry_id}",
        json={
            "expected_payment_date": third_date,
            "reschedule_reason": "Client travelling abroad",
        },
        headers=headers,
    )
    assert upd_resp_2.status_code == 200
    upd_data_2 = upd_resp_2.json()
    assert upd_data_2["expected_payment_date"] == third_date
    assert upd_data_2["reschedule_count"] == 2
    assert len(upd_data_2["reschedule_history"]) == 2
    assert upd_data_2["reschedule_history"][1]["reason"] == "Client travelling abroad"

    # 5. Fetch commitments pipeline
    pipeline_resp = await client.get(
        "/api/v1/sales-collections/commitments/pipeline",
        headers=headers,
    )
    assert pipeline_resp.status_code == 200
    pdata = pipeline_resp.json()
    assert pdata["total_commitments"] >= 1
    assert pdata["rescheduled_count"] >= 1
    assert float(pdata["total_promised_amount"]) >= 250000.0

    target_item = next((item for item in pdata["items"] if item["id"] == entry_id), None)
    assert target_item is not None
    assert target_item["customer_name"] == "Tariqul Islam"
    assert target_item["reschedule_count"] == 2
    assert target_item["status"] == "upcoming"
