# portfolio-rebalancer

Portfolio manager + investment simulation + rebalancing engine.

> ⚠️ This project is for educational purposes only. Not financial advice.

## What you get

- Import operations (CSV) into a normalized ledger
- Portfolio positions, average price, realized/unrealized P&L
- Cashflows, contributions, withdrawals
- Investment simulation (what-if)
- Rebalancing suggestions (target allocation + constraints)
- REST API + Web UI

## Tech stack

**API:** FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL  
**Jobs/Cache:** Redis + RQ  
**Frontend:** Next.js (TypeScript), TanStack Query, Tailwind, Recharts  
**Quality:** ruff, pyright, pytest, GitHub Actions  
**Infra:** Docker, Docker Compose

## Local development (Docker)

Requirements: Docker + Docker Compose

```bash
# 1) start services
docker compose up -d --build

# 2) run migrations
docker compose exec api alembic upgrade head

# 3) open
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
# Web: http://localhost:3000
```


### Prices CSV (Google Sheets)
Use a published CSV URL (`.../export?format=csv&gid=...`). Price resolution per ticker:
1) `price` (if present) → 2) `previous_close` → 3) fallback to `positions.csv` `price`.
