.PHONY: help install dev backend frontend test lint format docs clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	cd backend && pip install -e ".[dev]"
	cd frontend && npm ci
	cd docs && npm ci

dev: ## Start both backend and frontend in development mode
	@echo "Starting backend on :8000 and frontend on :3000 ..."
	@trap 'kill 0' EXIT; \
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload & \
	cd frontend && npm run dev & \
	wait

backend: ## Start backend only
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

frontend: ## Start frontend only
	cd frontend && npm run dev

test: ## Run all tests
	cd backend && pytest tests/ -v --tb=short --cov=app
	cd frontend && npx tsc --noEmit

test-backend: ## Run backend tests only
	cd backend && pytest tests/ -v --tb=short --cov=app

lint: ## Run linters
	cd backend && ruff check app/ tests/
	cd backend && ruff format --check app/ tests/
	cd frontend && npx tsc --noEmit

format: ## Auto-format code
	cd backend && ruff format app/ tests/
	cd backend && ruff check --fix app/ tests/

docs: ## Start docs dev server
	cd docs && npm run docs:dev

docs-build: ## Build documentation
	cd docs && npm run docs:build

pre-commit-install: ## Install pre-commit hooks
	pre-commit install
	pre-commit install --hook-type commit-msg

clean: ## Clean build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	rm -rf backend/dist backend/build backend/*.egg-info
	rm -rf frontend/dist
	rm -rf docs/.vitepress/dist docs/.vitepress/cache
