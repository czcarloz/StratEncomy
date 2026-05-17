# StratEncomy

Plataforma multi-tenant de gestão financeira pessoal e carteiras de investimento.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12 + FastAPI |
| Banco | PostgreSQL 16 + RLS |
| ORM | SQLAlchemy 2.0 + Alembic |
| Frontend | Next.js 14 + TypeScript + Tailwind |
| Container | Docker Compose |

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

## Setup inicial

```bash
# 1. Clone o repositório
git clone https://github.com/czcarloz/StratEncomy.git
cd StratEncomy

# 2. Crie o arquivo de variáveis de ambiente
cp .env.example .env
# Edite o .env e troque todas as senhas antes de subir

# 3. Suba os containers
docker compose up --build
```

Serviços disponíveis após o `docker compose up`:

| Serviço | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger Docs | http://localhost:8000/docs |
| pgAdmin | http://localhost:5050 |

## Desenvolvimento

```bash
# Subir apenas o banco (útil para rodar backend local)
docker compose up db -d

# Rodar testes do backend
cd backend
pip install -r requirements-dev.txt
pytest

# Lint
ruff check .
```

## Estrutura

```
StratEncomy/
├── backend/
│   ├── app/
│   │   ├── core/       # config, segurança, dependências
│   │   ├── db/         # session, base, helpers RLS
│   │   ├── models/     # SQLAlchemy
│   │   ├── schemas/    # Pydantic
│   │   ├── api/v1/     # routers
│   │   ├── services/   # lógica de negócio
│   │   └── main.py
│   └── tests/
├── frontend/
│   ├── app/            # Next.js App Router
│   ├── components/
│   └── lib/
├── docker-compose.yml
└── .env.example
```

## Branches

- `main` — código estável (protegida, merge apenas via PR)
- `dia-N` — branch de trabalho de cada dia do cronograma

## Progresso

- [x] Dia 1 — Fundação & Ambiente
- [ ] Dia 2 — Auth & Multi-tenant
- [ ] Dia 3 — Categorias & Transações
- [ ] Dia 4 — Frontend: Auth + Layout + Lançamentos
- [ ] Dia 5 — Cartão de Crédito & Aportes Planejados
- [ ] Dia 6 — Dashboard & Gráficos
- [ ] Dia 7 — Exportação de Relatórios
- [ ] Dia 8 — Segurança, Audit, Hardening
- [ ] Dia 9 — Investimentos (esqueleto)
- [ ] Dia 10 — Investimentos (dashboard) + Polimento + Deploy
