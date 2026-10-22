# Sunset Group Daily Call Activity — FastAPI Backend

## Overview

Production-ready FastAPI backend for the Sunset Group Daily Call Activity Dashboard. Manages daily call activity reports, meeting time tracking, and sales/collection records with role-based access control.

## Quick Start

### 1. Install dependencies

```powershell
cd backend
python -m pip install -r requirements.txt
```

### 2. Configure environment

```powershell
Copy-Item .env.example .env
# Edit .env and set:
#   DATABASE_URL  (SQLite default is pre-configured for local dev)
#   SECRET_KEY    (generate with: python -c "import secrets; print(secrets.token_hex(32))")
```

### 3. Create database tables

**Option A — Alembic (recommended for production):**
```powershell
alembic upgrade head
```

**Option B — Auto-create (development only, requires DEBUG=true in .env):**
Tables are created automatically on startup when `DEBUG=true`.

### 4. Seed demo admin (development only)

```powershell
python scripts/seed_dev.py
# username: admin | password: ChangeMe123!  ← CHANGE IMMEDIATELY
```

### 5. Start the server

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 6. View API documentation

- Swagger UI:  http://localhost:8000/docs
- ReDoc:       http://localhost:8000/redoc
- OpenAPI JSON: http://localhost:8000/openapi.json
- Health check: http://localhost:8000/health

---

## Running Tests

```powershell
python -m pytest
# With coverage:
python -m pytest --cov=app --cov-report=term-missing
```

Tests use an in-memory SQLite database and are isolated per test via session rollback.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./sunset_dashboard.db` | Database connection string |
| `SECRET_KEY` | **(required in production)** | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated CORS origins |
| `BUSINESS_TIMEZONE` | `Asia/Dhaka` | Report date timezone |
| `COOKIE_SECURE` | `false` | Set `true` in production (HTTPS) |
| `COOKIE_SAMESITE` | `lax` | Cookie SameSite policy |
| `DEBUG` | `false` | Enable debug logging & auto table creation |

---

## API Endpoints (v1)

All endpoints are under `/api/v1`.

### Authentication
| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Login (form-data: username, password) |
| POST | `/auth/refresh` | Refresh access token via HttpOnly cookie |
| POST | `/auth/logout` | Clear refresh-token cookie |
| GET | `/auth/me` | Current user profile |

### Reports
| Method | Path | Description |
|---|---|---|
| POST | `/reports` | Create daily report |
| GET | `/reports` | List reports (filterable by date, status, employee) |
| GET | `/reports/{id}` | Get report |
| PUT | `/reports/{id}` | Update report |
| DELETE | `/reports/{id}` | Delete report |
| POST | `/reports/{id}/submit` | Submit report |
| GET | `/reports/{id}/summary` | Calculated summary |

### Call Activity
| Method | Path | Description |
|---|---|---|
| GET | `/reports/{id}/calls` | Get call entries |
| PUT | `/reports/{id}/calls` | Upsert (replace) call entries |

### Meeting Activity
| Method | Path | Description |
|---|---|---|
| GET | `/reports/{id}/meetings` | Get meeting entries |
| PUT | `/reports/{id}/meetings` | Upsert (replace) meeting entries |

### Sales & Collection
| Method | Path | Description |
|---|---|---|
| GET | `/reports/{id}/sales-collections` | List entries |
| POST | `/reports/{id}/sales-collections` | Create entry |
| PUT | `/sales-collections/{id}` | Update entry |
| DELETE | `/sales-collections/{id}` | Delete entry |

### Dashboard
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/summary` | Aggregated summary |
| GET | `/dashboard/call-trends` | Call activity trends |
| GET | `/dashboard/lead-breakdown` | Lead category breakdown |
| GET | `/dashboard/sales-collection` | Sales/collection summary |
| GET | `/dashboard/employee-performance` | Performance (admin only) |

### Employees
| Method | Path | Description |
|---|---|---|
| GET | `/employees` | List employees (admin) |
| POST | `/employees` | Create employee (admin) |
| GET | `/employees/{id}` | Get employee |
| PUT | `/employees/{id}` | Update employee (admin) |
| DELETE | `/employees/{id}` | Delete employee (admin) |

### Settings & Targets
| Method | Path | Description |
|---|---|---|
| GET | `/settings` | All settings |
| GET | `/settings/{namespace}` | Settings by namespace |
| PUT | `/settings` | Upsert setting (admin) |
| DELETE | `/settings/{namespace}/{key}` | Delete setting (admin) |
| GET | `/targets` | List targets |
| POST | `/targets` | Create target (admin) |
| PUT | `/targets/{id}` | Update target (admin) |
| DELETE | `/targets/{id}` | Delete target (admin) |

---

## Database Migrations (Alembic)

```powershell
# Generate a new migration after model changes:
alembic revision --autogenerate -m "describe_your_change"

# Apply migrations:
alembic upgrade head

# Rollback one step:
alembic downgrade -1
```

---

## Project Structure

```
backend/
  app/
    main.py                 — FastAPI app, CORS, lifespan
    api/v1/
      router.py             — Aggregated v1 router
      endpoints/
        auth.py             — JWT login/refresh/logout
        reports.py          — Daily report CRUD
        calls.py            — Call activity upsert
        meetings.py         — Meeting activity upsert
        sales_collections.py — Sales/collection CRUD
        dashboard.py        — Aggregated dashboards
        employees.py        — User management (admin)
        settings.py         — App config & targets
    core/
      config.py             — Pydantic settings
      security.py           — JWT + bcrypt
      permissions.py        — FastAPI auth dependencies
    db/
      base_class.py         — SQLAlchemy declarative base
      base.py               — Model importer for Alembic
      session.py            — Async engine & session
    models/                 — SQLAlchemy ORM models
    schemas/                — Pydantic request/response schemas
    services/               — Business logic
    repositories/           — Database access layer
  alembic/                  — Migration scripts
  tests/                    — Pytest test suite
  scripts/seed_dev.py       — Dev-only seed script
```

---

## Assumptions Requiring Sunset Group Confirmation

1. **total_dialed formula**: Currently calculated as `slot_10am_1pm + slot_2pm_5pm + slot_5pm_6pm` when all three slots are provided. Confirm this is correct.
2. **Meeting activity — count vs. duration**: The system aggregates all slot values the same way for all activity types. Confirm which types are visit counts (not summed as minutes) versus time durations.
3. **Lead status labels (HP, P, Fub, NI)**: Business definitions not confirmed. Labels are configurable via `/settings`. Admin should set canonical labels before go-live.
4. **Actual collection categories**: Defined as `new_sales_collection`, `tb_collection`, `emi_collection`. Confirm no other categories represent cash received.
5. **Commitment definition**: New Sales Commit Payment 1/2/3 and Token-to-Booking Commits are treated as future promises, never as actual received amounts. Confirm.
6. **outstanding_commitments**: Not included in collected revenue totals. Both are shown separately in the summary. Confirm business requires them to remain always separate.
7. **Report timezone**: Report dates are stored as calendar dates and interpreted in `Asia/Dhaka` timezone. Confirm.
8. **Default targets**: No targets are auto-generated. All targets must be explicitly created by an admin. The API returns `null` for unconfigured targets. Confirm this is expected (vs. hardcoded defaults).
