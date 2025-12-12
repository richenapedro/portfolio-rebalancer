# Import (CSV)

## Goal

Convert broker exports into a single normalized ledger.

## Normalized columns (recommended)

- trade_date (YYYY-MM-DD)
- portfolio
- asset_type (stock/etf/crypto/cash)
- symbol
- side (buy/sell/dividend/fee/tax/deposit/withdraw)
- quantity (positive)
- price (unit price)
- currency (USD/EUR/...)
- fees (optional)
- taxes (optional)
- note (optional)

## Minimal accepted columns (MVP)

- trade_date
- symbol
- side
- quantity
- price
- currency

## Example

````csv
trade_date,portfolio,asset_type,symbol,side,quantity,price,currency,fees,taxes,note
2025-12-01,main,stock,AAPL,buy,10,180.25,USD,1.5,0,first buy
2025-12-10,main,stock,AAPL,sell,4,190.00,USD,1.5,0,partial sell
2025-12-15,main,cash,USD,deposit,1,1000.00,USD,0,0,contribution


---

### `docs/REBALANCING.md`
```md
# Rebalancing & simulation

## Target allocation
Weights that sum to 1.0, defined by "buckets" (asset class / tags).

Example:
- EQUITY: 0.60
- BONDS: 0.30
- CASH: 0.10

## Methods
- Full rebalance: match targets as close as possible
- Band rebalance (optional): rebalance only if drift exceeds threshold

## Constraints (MVP)
- cash_buffer_pct (keep cash reserve)
- min_trade_value
- max_trades
- fees_model (flat or percent)
- allow_sells (true/false)

## Output
- suggested_orders (buy/sell)
- post_trade_allocation
- warnings (insufficient cash, filtered by min trade, etc.)

## Simulation (what-if)
Inputs:
- contributions schedule
- rebalance schedule OR band rule
- constraints

Outputs:
- value timeline
- allocation drift
- turnover and estimated costs
````
