# Architecture

## Principles

- Ledger-first: operations are the source of truth
- Deterministic computations: positions/P&L/allocation derived from ledger
- Pluggable adapters: importers and price providers are replaceable

## Components

- API (FastAPI): auth + CRUD + orchestration
- Core (domain): ledger, positions, pnl, allocation, rebalance, simulation
- Adapters: broker CSV importers, price providers
- Jobs: async import/recompute via Redis + RQ
- Web: Next.js UI

## Data model (MVP)

- portfolios
- operations (normalized ledger)
- instruments (metadata)
- import_jobs (status/errors)
- (optional) snapshots for fast reads
