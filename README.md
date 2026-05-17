# StratEncomy

Multi-tenant platform for personal financial management and investment portfolio tracking.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 + FastAPI |
| Database | PostgreSQL 16 + RLS |
| ORM | SQLAlchemy 2.0 + Alembic |
| Frontend | Next.js 14 + TypeScript + Tailwind |
| Container | Docker Compose |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

## Getting started

```bash
# 1. Clone the repository
git clone https://github.com/czcarloz/StratEncomy.git
cd StratEncomy

# 2. Create the environment file
cp .env.example .env
# Edit .env and replace all passwords before starting

# 3. Start all containers
docker compose up --build
```

Services available after `docker compose up`:

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger Docs | http://localhost:8000/docs |
| pgAdmin | http://localhost:5050 |

## Development

```bash
# Start only the database (useful for running backend locally)
docker compose up db -d

# Run backend tests
cd backend
pip install -r requirements-dev.txt
pytest

# Lint
ruff check .
```

## Project structure

```
StratEncomy/
├── backend/
│   ├── app/
│   │   ├── core/       # config, security, dependencies
│   │   ├── db/         # session, base, RLS helpers
│   │   ├── models/     # SQLAlchemy models
│   │   ├── schemas/    # Pydantic schemas
│   │   ├── api/v1/     # routers
│   │   ├── services/   # business logic
│   │   └── main.py
│   └── tests/
├── frontend/
│   ├── app/            # Next.js App Router
│   ├── components/
│   └── lib/
├── docker-compose.yml
└── .env.example
```

## Branch strategy

- `main` — stable code (protected, merge via PR only)
- `develop` — integration branch (merge target for each day's work)
- `dia-N` — daily working branches

## Progress

- [x] Day 1 — Foundation & Environment
- [ ] Day 2 — Auth & Multi-tenant
- [ ] Day 3 — Categories & Transactions
- [ ] Day 4 — Frontend: Auth + Layout + Transactions
- [ ] Day 5 — Credit Card & Planned Investments
- [ ] Day 6 — Dashboard & Charts
- [ ] Day 7 — Report Export
- [ ] Day 8 — Security, Audit, Hardening
- [ ] Day 9 — Investments (skeleton)
- [ ] Day 10 — Investments (dashboard) + Polish + Deploy
