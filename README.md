# StratEncomy

Multi-tenant platform for personal financial management and investment portfolio tracking.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 + FastAPI |
| Database | PostgreSQL 16 + Row Level Security |
| ORM | SQLAlchemy 2.0 async + Alembic |
| Auth | JWT (access + refresh tokens) + argon2 |
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Charts | Recharts |
| Reports | ReportLab (PDF) + openpyxl (XLSX) |
| Container | Docker Compose |

## Features

- **Multi-tenant**: row-level tenancy + PostgreSQL RLS as defence in depth
- **Auth**: JWT with rotating refresh tokens, account lockout after 5 failed attempts, strong password policy
- **Transactions**: income, expense, investment with categories and monthly filters
- **Credit Cards**: purchases with instalment spreading, monthly invoice view
- **Planned Investments**: per-month investment annotations
- **Portfolios**: assets (stocks, FIIs, ETFs, BDRs, bonds, crypto), buy/sell operations, dividends, weighted average price calculation, goals with progress bars
- **Dashboard**: KPI cards, expense pie chart, yearly bar/line charts; portfolio allocation pie + dividends bar
- **Reports**: PDF and XLSX export for transactions and portfolios
- **Security**: rate limiting (slowapi), security headers, full audit log on all write operations
- **Admin**: audit log viewer with pagination and action filtering

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose v2)
- Git

## Quick start

```bash
# 1. Clone
git clone https://github.com/czcarloz/StratEncomy.git
cd StratEncomy

# 2. Configure environment
cp .env.example .env
# Open .env and change all passwords before proceeding

# 3. Start
docker compose up --build
```

After startup:

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger / OpenAPI | http://localhost:8000/docs |
| pgAdmin | http://localhost:5050 |

First login uses the admin credentials defined in `.env` (default `admin@stratencomy.com` / `Admin@1234`).

## Environment variables

Copy `.env.example` to `.env` and edit:

| Variable | Description |
|---|---|
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password (change before deploy) |
| `POSTGRES_DB` | Database name |
| `SECRET_KEY` | JWT signing secret (use `openssl rand -hex 32`) |
| `ADMIN_EMAIL` | Default admin account email |
| `ADMIN_PASSWORD` | Default admin account password |
| `PGADMIN_EMAIL` | pgAdmin login email |
| `PGADMIN_PASSWORD` | pgAdmin login password |

## Development workflow

```bash
# Start only the database (run backend locally)
docker compose up db -d

# Run Alembic migrations
docker exec stratencomy-backend-1 alembic upgrade head

# Backend tests
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest

# Lint
ruff check .
```

## Project structure

```
StratEncomy/
├── backend/
│   ├── app/
│   │   ├── core/           # config, security, JWT, dependencies
│   │   ├── db/             # async session, Base, RLS session helper
│   │   ├── models/         # SQLAlchemy models (user, transaction, credit_card,
│   │   │                   #   planned_investment, portfolio, audit)
│   │   ├── schemas/        # Pydantic schemas (input/output)
│   │   ├── api/v1/         # FastAPI routers
│   │   │   ├── auth.py     # login, register, refresh, logout, tenants
│   │   │   ├── categories.py
│   │   │   ├── transactions.py
│   │   │   ├── credit_cards.py
│   │   │   ├── planned_investments.py
│   │   │   ├── portfolios.py   # portfolios, assets, operations, dividends, goals
│   │   │   ├── dashboard.py
│   │   │   ├── reports.py      # PDF/XLSX export
│   │   │   └── admin.py        # audit log (admin only)
│   │   ├── services/
│   │   │   ├── audit.py        # atomic audit log helper
│   │   │   └── report_service.py
│   │   └── main.py
│   ├── alembic/versions/   # migrations
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── login/
│   │   └── (dashboard)/
│   │       ├── dashboard/
│   │       ├── transactions/
│   │       ├── credit-cards/
│   │       ├── planned-investments/
│   │       ├── portfolios/
│   │       │   └── [id]/   # detail with Positions / Dashboard / Goals tabs
│   │       ├── categories/
│   │       └── audit/      # admin only
│   ├── components/
│   │   ├── layout/         # Sidebar, Header
│   │   └── ui/             # Button, Input, Modal, Select, Badge, Spinner, Toast
│   └── lib/
│       ├── api.ts           # typed API client
│       ├── auth.ts          # localStorage token helpers
│       ├── download.ts      # blob download helper
│       └── utils.ts
├── docker-compose.yml
└── .env.example
```

## Deploy (VPS)

For production on a VPS (Ubuntu 22.04+):

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh

# 2. Clone and configure
git clone https://github.com/czcarloz/StratEncomy.git
cd StratEncomy
cp .env.example .env
# Set strong passwords and SECRET_KEY in .env
# Set NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# 3. Set up reverse proxy (Caddy example)
# /etc/caddy/Caddyfile:
#   yourdomain.com {
#     reverse_proxy localhost:3000
#   }
#   api.yourdomain.com {
#     reverse_proxy localhost:8000
#   }

# 4. Start
docker compose -f docker-compose.yml up -d --build

# 5. Automated PostgreSQL backup (daily, keep 7 days)
# Add to crontab:
# 0 3 * * * docker exec stratencomy-db-1 pg_dump -U stratencomy stratencomy | \
#   gzip > /backups/stratencomy_$(date +\%Y\%m\%d).sql.gz && \
#   find /backups -name "stratencomy_*.sql.gz" -mtime +7 -delete
```

## Security checklist

- [x] Passwords hashed with argon2
- [x] JWT access (15 min) + refresh (7 days, rotating)
- [x] Account lockout after 5 failed login attempts
- [x] Strong password policy (min 8 chars, uppercase, digit, special char)
- [x] Rate limiting on auth endpoints (slowapi)
- [x] Security headers on all responses
- [x] Row Level Security on all tenant tables
- [x] Full audit log on all write operations
- [x] Refresh tokens revoked on logout
- [x] Tenant isolation enforced at query level + DB level (RLS)

## Progress

- [x] Day 1 — Foundation & Environment
- [x] Day 2 — Auth & Multi-tenant
- [x] Day 3 — Categories & Transactions (API)
- [x] Day 4 — Frontend: Auth + Layout + Transactions
- [x] Day 5 — Credit Card & Planned Investments
- [x] Day 6 — Dashboard & Charts
- [x] Day 7 — Report Export (PDF + XLSX)
- [x] Day 8 — Security, Audit, Hardening
- [x] Day 9 — Investments: portfolios, assets, operations, dividends
- [x] Day 10 — Portfolio dashboard, goals, export, README
