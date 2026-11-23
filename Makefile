# Music World — root commands. See .kiro/steering/infrastructure.md and testing.md.
.PHONY: help dev test check schemas schemas-check build deploy logs

API := apps/api
WEB := apps/web
COMPOSE := infra/docker-compose.yml

help: ## List targets
	@grep -E "^[a-z-]+:.*## " $(MAKEFILE_LIST) | sed -E "s/:.*## /\t/"

dev: ## Start web, api, worker, postgres and redis locally
	@test -f $(COMPOSE) || { echo "make dev: $(COMPOSE) not created yet (01-foundation task 6.1)"; exit 1; }
	docker compose -f $(COMPOSE) up --build

test: ## Run API and web tests (no slow tests)
	cd $(API) && uv run pytest -q -m "not slow"
	@if [ -f $(WEB)/package.json ]; then pnpm --dir $(WEB) vitest run; else echo "[test] apps/web not scaffolded yet, skipped"; fi

check: schemas-check test ## Lint + types + tests + architecture check
	cd $(API) && uv run ruff check . && uv run ruff format --check . && uv run mypy
	@if [ -f $(WEB)/package.json ]; then pnpm --dir $(WEB) lint && pnpm --dir $(WEB) typecheck; fi
	bash scripts/agents/validate-architecture.sh

schemas: ## pydantic -> packages/schemas/*.schema.json -> apps/web/src/templates/generated (TS + zod)
	cd $(API) && uv run python scripts/export_schemas.py ../../packages/schemas
	pnpm --filter @music-world/schemas generate

schemas-check: schemas ## Fail if generated schemas differ from the committed ones
	@git diff --exit-code --stat -- packages/schemas $(WEB)/src/templates/generated \
	  || { echo "Generated schemas are out of date: commit the output of make schemas"; exit 1; }

build: ## Build Docker images
	@test -f $(COMPOSE) || { echo "make build: $(COMPOSE) not created yet (01-foundation task 6.1)"; exit 1; }
	docker compose -f $(COMPOSE) build

deploy: ## Deploy to OVHcloud (skill deploy-ovh)
	@test -f infra/deploy.sh || { echo "make deploy: infra/deploy.sh not created yet (01-foundation task 6.3)"; exit 1; }
	bash infra/deploy.sh

logs: ## Follow Docker Compose logs
	docker compose -f $(COMPOSE) logs -f --tail=100
