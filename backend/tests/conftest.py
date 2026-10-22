"""
Shared pytest fixtures for the Sunset Group backend test suite.

Uses SQLite in-memory via aiosqlite for fast, isolated tests.
PostgreSQL compatibility is maintained through SQLAlchemy ORM abstraction.
"""
from __future__ import annotations

import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import hash_password
from app.db.base import Base  # registers all models
from app.db.session import get_db
from app.main import app
from app.models.user import User, UserRole

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncGenerator[AsyncSession, None]:
    """Per-test async session with rollback for isolation."""
    SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient with the app's get_db dependency overridden to the test session."""

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# ── Fixture users ─────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def admin_user(db: AsyncSession) -> User:
    user = User(
        full_name="Admin User",
        email="admin@sunsetgroup.com",
        username="admin",
        password_hash=hash_password("AdminPass123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def employee_user(db: AsyncSession) -> User:
    user = User(
        full_name="Employee One",
        email="emp1@sunsetgroup.com",
        username="emp1",
        password_hash=hash_password("EmpPass123"),
        role=UserRole.EMPLOYEE,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def employee_user_2(db: AsyncSession) -> User:
    user = User(
        full_name="Employee Two",
        email="emp2@sunsetgroup.com",
        username="emp2",
        password_hash=hash_password("EmpPass456"),
        role=UserRole.EMPLOYEE,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def get_token(client: AsyncClient, username: str, password: str) -> str:
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": password},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def admin_headers(client: AsyncClient, admin_user: User) -> dict:
    token = await get_token(client, admin_user.username, "AdminPass123")
    return {"Authorization": f"Bearer {token}"}


async def emp_headers(client: AsyncClient, user: User, password: str = "EmpPass123") -> dict:
    token = await get_token(client, user.username, password)
    return {"Authorization": f"Bearer {token}"}
