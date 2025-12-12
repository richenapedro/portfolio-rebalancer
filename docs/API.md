# API (MVP)

The API will be documented via OpenAPI:

- Swagger UI: /docs
- OpenAPI JSON: /openapi.json

## Endpoints (planned)

### Auth

- POST /auth/login
- POST /auth/refresh

### Portfolios

- GET /portfolios
- POST /portfolios
- GET /portfolios/{id}

### Operations

- GET /portfolios/{id}/operations
- POST /portfolios/{id}/operations
- DELETE /operations/{id}

### Imports

- POST /portfolios/{id}/imports (CSV upload)
- GET /imports/{id} (status + errors)

### Analytics

- GET /portfolios/{id}/positions
- GET /portfolios/{id}/allocation
- GET /portfolios/{id}/pnl

### Rebalancing

- POST /portfolios/{id}/rebalancing/preview
  body: target_weights + constraints

### Simulations

- POST /portfolios/{id}/simulations
- GET /simulations/{id}
