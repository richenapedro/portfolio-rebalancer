# Roadmap

This roadmap outlines the evolution of the project from a simple Python package
to a more complete engineering showcase.

---

## Phase 1 — Foundation (MVP)

**Goal:** basic package + CI + tests

- [ ] Create package structure under `src/saas_churn/`
- [ ] Implement basic modules:
  - config loader
  - io utilities
  - transform functions
  - model interface + dummy model
  - pipeline runner
- [ ] Add example dataset
- [ ] Write unit tests for each module
- [ ] Configure GitHub Actions (lint + tests)
- [ ] Add README with clear project purpose

---

## Phase 2 — CLI & Feature Expansion

**Goal:** enable pipeline execution via command line

- [ ] Create CLI using Typer or Click
- [ ] Add commands:
  - `run-pipeline`
  - `prepare-data`
  - `predict-churn`
- [ ] Improve logging & error handling
- [ ] Add config profiles (dev/prod)
- [ ] Increase test coverage

---

## Phase 3 — Model Upgrade (Optional)

**Goal:** plug a real ML model, but keeping minimal complexity

- [ ] Add logistic regression baseline
- [ ] Serialize model artifacts
- [ ] Add “train” step to pipeline
- [ ] Add unit tests for ML component
- [ ] Document feature definitions

---

## Phase 4 — Optional API Layer

**Goal:** expose churn prediction via FastAPI (only if useful for portfolio)

- [ ] Basic FastAPI project with one endpoint
- [ ] Predict churn from HTTP request
- [ ] Add API tests
- [ ] Integrate API tests into CI

---

## Phase 5 — Packaging & Distribution

- [ ] Add `pyproject.toml` metadata
- [ ] Optional: publish to PyPI Test Repository
- [ ] Optional: build Docker image

---

This roadmap is intentionally lightweight and realistic for a solo portfolio project.
