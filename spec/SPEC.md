# SaaS Data Pipeline — Python Engineering Project

## Overview
This repository simulates the internal data platform of a fictional SaaS company.
The goal is not machine learning itself, but to demonstrate robust **Python
engineering practices** for building a modular, testable and automated data pipeline.

The system processes customer subscription data and produces:
- cleaned datasets
- feature tables
- churn risk scores (model is pluggable; simple baseline initially)

The project emphasizes:
- well-structured Python package (`src/saas_churn/`)
- configuration management via environment variables
- data ingestion / transformation pipeline
- modular model interface (swap models without breaking pipeline)
- automated testing with `pytest`
- linting, formatting and type checking
- CI pipeline using GitHub Actions
- optional CLI for pipeline execution

## Architecture

src/saas_churn/
│
├── config.py # loads environment variables, paths, parameters
├── io.py # data loading/saving abstraction
├── transform.py # data cleaning / feature engineering
├── model.py # simple model interface + baseline churn predictor
├── pipeline.py # orchestrates end-to-end workflow
└── cli.py # (later) command-line interface using Typer or Click


## Pipeline Flow
1. Load raw dataset  
2. Apply transformations  
3. Produce model-ready table  
4. Run churn scoring  
5. Export results  

All components must be individually testable.

## Non-Goals
- building a production ML system  
- complex infra (Kubernetes, Spark…)  
- microservices (API only if added later as optional module)

## Deliverables
- Clean package structure with documentation
- Automated CI pipeline
- Unit tests covering at least 80%
- Example dataset + reproducible pipeline run
