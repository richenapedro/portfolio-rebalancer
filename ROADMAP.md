# Roadmap

## M1 — Ledger & portfolio basics

- [ ] Portfolios CRUD
- [ ] Operations ledger CRUD
- [ ] Positions + avg price
- [ ] Realized/unrealized P&L
- [ ] Allocation by bucket

## M2 — CSV import

- [ ] Upload CSV endpoint
- [ ] Validate + normalize (pandas)
- [ ] Async job (RQ) + import status
- [ ] Error report with row numbers

## M3 — Rebalancing preview

- [ ] Target weights (sum = 1.0)
- [ ] Full rebalance
- [ ] Band rebalancing (optional)
- [ ] Constraints: cash buffer, min trade, max trades, allow sells, fees model

## M4 — Simulation

- [ ] Contributions schedule (monthly/weekly)
- [ ] Rebalance schedule OR band rule
- [ ] Timeline output (value, allocation drift, turnover)

## M5 — Polish

- [ ] CI (lint/typecheck/tests)
- [ ] Structured logs + basic health checks
- [ ] API rate limiting
