# Roadmap de Sprints

## **Sprint 1 (Produto “rodando”)**

- **Postgres + FastAPI**
  - Autenticação (auth)
  - Organização (org)
  - Upload de dataset
  - Listagem de datasets
- **Next.js**
  - Login
  - Tela de datasets
- **Infra:** Docker Compose

---

## **Sprint 2 (ML básico)**

- Validação do CSV
- Treino síncrono (simples)
- Salvar modelo + métricas
- Tela de modelos + métricas

---

## **Sprint 3 (Jobs, batch scoring)**

- **Redis + Celery**
- Treino/score como job + status
- Predições na UI (tabela + gráfico)

---

## **Sprint 4 (Cara de “empresa”)**

- **MLflow** (opcional)
- Logs estruturados
- Primeiros dashboards (Prometheus/Grafana ou Sentry)
- RBAC mínimo + audit log básico
