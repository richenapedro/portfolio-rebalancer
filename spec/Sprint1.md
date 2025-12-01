
# ✅ Sprint 1 — Checklist (Simulando empresa grande + GitHub)

## Planejamento (GitHub)
- [X] Criar Milestone “Sprint 1”
- [X] Abrir Issues (1 por item grande: infra, auth, orgs, datasets, frontend auth, frontend datasets, CI)
- [X] Definir labels mínimas: backend, frontend, infra, ci, docs, security

---

## Padrões de versionamento (antes de codar)
- [X] Definir estratégia trunk-based: main protegido + branches curtas + PR obrigatório
- [X] Definir padrão de branch: feat/..., fix/..., chore/..., docs/...
- [X] Definir padrão de commits: Conventional Commits (feat:, fix:, chore:, docs:)
- [X] Criar CONTRIBUTING.md com: branch naming, commits, PR checklist, como rodar/testar local
- [X] Criar CHANGELOG.md (com seção Unreleased) + usar tags depois (ex. v0.1.0)

---

## Setup do repositório (GitHub “de empresa”)
- [X] Criar repo no GitHub e dar push do main
- [X] Ativar Branch protection do main:
  - [X] Exigir PR para merge
  - [ ] Exigir status checks (CI) passarem
  - [X] Bloquear force-push
- [X] Adicionar templates:
  - [X] .github/PULL_REQUEST_TEMPLATE.md
  - [X] .github/ISSUE_TEMPLATE/bug.yml e feature.yml (mínimo)
- [X] Adicionar .github/CODEOWNERS (mesmo que seja você)
- [X] Adicionar LICENSE + SECURITY.md (mínimo) + CODE_OF_CONDUCT.md (opcional)
- [X] Adicionar .editorconfig, .gitattributes, .gitignore (Python + Node)

---

## Qualidade local (hooks)
- [ ] Backend: configurar pre-commit (ex.: ruff + ruff-format ou black, check-yaml, end-of-file-fixer)
- [ ] Frontend: configurar eslint + prettier
- [ ] Padronizar comandos em Makefile ou taskfile:
  - [ ] make lint, make test, make fmt, make up

---

## Infra local (Docker Compose)
- [ ] Criar infra/docker-compose.yml com postgres + api (hot reload)
- [ ] Criar .env.example e documentar variáveis no README.md
- [ ] Garantir “subiu = funciona”: docker compose up sem erro

---

## Backend (FastAPI + Postgres) — mínimo funcional
- [ ] Configurar SQLAlchemy 2.0 + sessão + Alembic
- [ ] Migration inicial com tabelas:
  - [ ] users
  - [ ] orgs
  - [ ] memberships (role)
  - [ ] datasets (metadata)
- [ ] Criar GET /health
- [ ] Auth:
  - [ ] POST /auth/register
  - [ ] POST /auth/login
  - [ ] GET /me
- [ ] Orgs:
  - [ ] POST /orgs (cria org + membership admin)
  - [ ] GET /orgs (lista orgs do usuário)
- [ ] Datasets:
  - [ ] POST /orgs/{org_id}/datasets/upload (salva arquivo local + metadata no DB)
  - [ ] GET /orgs/{org_id}/datasets
  - [ ] GET /orgs/{org_id}/datasets/{dataset_id}

---

## Frontend (Next.js) — mínimo funcional
- [ ] Setup Next.js + TS + Tailwind
- [ ] Cliente HTTP com JWT (storage + header)
- [ ] Páginas:
  - [ ] /register
  - [ ] /login
  - [ ] /orgs (listar + criar org)
  - [ ] /datasets (listar + upload; usa org ativa)
- [ ] Guard de rota (sem token → login)
- [ ] Persistir “org ativa” (localStorage)

---

## CI (GitHub Actions) + gates do main
- [ ] Workflow api-ci.yml: lint + typecheck (opcional) + tests
- [ ] Workflow frontend-ci.yml: lint + build
- [ ] Marcar esses workflows como required checks na proteção do main

---

## “Modo empresa”: fluxo de PR (obrigatório no Sprint 1)
- [ ] Para cada issue: criar branch → commits pequenos → PR → merge
- [ ] Checklist do PR:
  - [ ] descrição do que foi feito + como testar
  - [ ] screenshots (front) quando aplicável
  - [ ] CI verde
