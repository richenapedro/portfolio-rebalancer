# Sprint 1 — Foundation Setup

## Goal

Set up the core structure of the project as a professional Python package,
including tests and CI.

---

## Tasks

### 1. Repository Initialization

- [ ] Create `src/saas_churn/` base package
- [ ] Create empty module files:
  - `config.py`
  - `io.py`
  - `transform.py`
  - `model.py`
  - `pipeline.py`
- [ ] Add example dataset to `data/raw/`

---

### 2. Project Tooling

- [ ] Create `pyproject.toml` with:
  - dependencies
  - black
  - ruff
  - pytest config
- [ ] Add `.env.example`
- [ ] Add `.gitignore`

---

### 3. Continuous Integration

- [ ] Create `.github/workflows/ci.yml` to run:
  - `pip install .`
  - lint (ruff)
  - formatting check (black)
  - tests (pytest)

---

### 4. Basic Implementations

- [ ] `config.py`: load paths/env variables
- [ ] `io.py`: simple CSV read/write wrappers
- [ ] `transform.py`: basic cleaning + feature creation
- [ ] `model.py`: dummy churn predictor (ex: rule-based or random)
- [ ] `pipeline.py`: orchestrate load → transform → predict → export

---

### 5. Unit Tests

- [ ] Create `tests/` folder
- [ ] Add tests for:
  - config
  - io
  - transform
  - model
  - pipeline (integration-style)

---

## Acceptance Criteria

- CI must pass (lint + tests)
- Pipeline must run end-to-end on example dataset
- Repo must be readable and professional
