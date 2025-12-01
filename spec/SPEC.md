# Resumo

## SaaS multi-tenant onde cada empresa (Org) faz upload de dados (CSV/API), treina um modelo de Churn (ou Lead Scoring) e vê:

- **Scores por cliente/lead**
- **Métricas do modelo**
- **Alertas** (ex.: “top 20 clientes com maior risco”)

---

## Camada MVP (primeira entrega)

- **Front:** Next.js + TypeScript + Tailwind
- **API:** FastAPI + Pydantic
- **DB:** Postgres + SQLAlchemy + Alembic
- **Jobs:** Celery + Redis (só quando entrar treino assíncrono)
- **ML:** scikit-learn (primeiro) + (depois XGBoost/LightGBM)
- **Dev:** Docker Compose + GitHub Actions (lint/test)

---

## Entidades essenciais do projeto:

### 1) **User (Usuário)**

Quem acessa o sistema.  
**Campos típicos:**

- `id`
- `name`
- `email`
- `password_hash`
- `created_at`

---

### 2) **Organization / Tenant (Empresa)**

A “conta” da empresa dentro do SaaS (multi-tenant).  
**Campos:**

- `id`
- `name`
- `created_at`

---

### 3) **Membership (Vínculo usuário↔empresa)**

Liga **User** a **Organization** e define papel (admin/member).  
**Campos:**

- `user_id`
- `org_id`
- `role`

---

### 4) **Dataset (Conjunto de dados)**

Um upload/ingestão de dados que será usado para treino e scoring.  
**Campos:**

- `id`
- `org_id`
- `name`
- `file_path` (ou `url`)
- `schema_json`
- `status`
- `created_at`

---

### 5) **TrainingRun / Job (Execução de treino)**

Um registro de “tarefa rodando” (treino batch, etc.).  
**Campos:**

- `id`
- `org_id`
- `dataset_id`
- `status` (queued/running/success/failed)
- `logs`
- `started_at`
- `ended_at`

---

### 6) **ModelVersion (Versão do modelo)**

O resultado de um treino: “modelo v1, v2…”, com métricas.  
**Campos:**

- `id`
- `org_id`
- `training_run_id`
- `artifact_path`
- `metrics_json`
- `created_at`
- `stage` (staging/prod)

---

### 7) **Prediction (Predição/Score)**

Os resultados gerados (por linha do dataset, ou por `customer_id`).  
**Campos:**

- `id`
- `org_id`
- `dataset_id`
- `model_version_id`
- `entity_key` (ex.: `customer_id`)
- `score`
- `created_at`

---

> **Dica:** Comece com apenas **4 entidades no MVP**:

- `User`
- `Organization`
- `Dataset`
- `ModelVersion`
