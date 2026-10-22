"""Tests for employee/admin permissions."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import admin_headers, emp_headers


@pytest.mark.asyncio
async def test_admin_can_create_employee(client: AsyncClient, admin_user):
    headers = await admin_headers(client, admin_user)
    resp = await client.post(
        "/api/v1/employees",
        json={
            "full_name": "New Employee",
            "email": "new@sunsetgroup.com",
            "username": "newuser",
            "password": "SecurePass99",
            "role": "employee",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["username"] == "newuser"
    # Password hash must never be returned
    assert "password" not in resp.json()
    assert "password_hash" not in resp.json()


@pytest.mark.asyncio
async def test_employee_cannot_create_employee(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    resp = await client.post(
        "/api/v1/employees",
        json={
            "full_name": "Hacker",
            "email": "hacker@sunsetgroup.com",
            "username": "hacker",
            "password": "HackPass123",
            "role": "admin",
        },
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_duplicate_email_rejected(client: AsyncClient, admin_user, employee_user):
    headers = await admin_headers(client, admin_user)
    resp = await client.post(
        "/api/v1/employees",
        json={
            "full_name": "Dup",
            "email": employee_user.email,
            "username": "uniqueuser99",
            "password": "SecurePass99",
            "role": "employee",
        },
        headers=headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_employee_can_read_own_profile(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    resp = await client.get(f"/api/v1/employees/{employee_user.id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == employee_user.id


@pytest.mark.asyncio
async def test_employee_cannot_read_other_profile(
    client: AsyncClient, employee_user, employee_user_2
):
    h2 = await emp_headers(client, employee_user_2, "EmpPass456")
    resp = await client.get(f"/api/v1/employees/{employee_user.id}", headers=h2)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_delete_self(client: AsyncClient, admin_user):
    headers = await admin_headers(client, admin_user)
    resp = await client.delete(f"/api/v1/employees/{admin_user.id}", headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_employee_performance_requires_admin(client: AsyncClient, employee_user):
    headers = await emp_headers(client, employee_user)
    resp = await client.get("/api/v1/dashboard/employee-performance", headers=headers)
    assert resp.status_code == 403
