# Music World — root commands. See .kiro/steering/infrastructure.md and testing.md. `make help` lists the targets.
.PHONY: ocean-models help install garage-init garage-up \
	dev dev-all dev-db-password dev-web-stack kill-web kill-all dev-local dev-redis dev-infra dev-api dev-worker dev-web up down restart ps logs shell \
	build build-api build-web rebuild \
	test test-api test-web check check-api check-web bundle-check arch lint format schemas schemas-check \
	deploy check-env db-password \
	smoke disk prune prune-images prune-cache prune-all prune-volumes clean clean-deps

API := apps/api
WEB := apps/web
COMPOSE := infra/docker-compose.yml
COMPOSE_DEV := infra/docker-compose.dev.yml
DC := docker compose -f $(COMPOSE)
# Optional apps/api/.env (copy of apps/api/.env.example) is loaded by uv for the host-run api and worker.
API_ENV_FILE := $(if $(wildcard $(API)/.env),--env-file .env,)
SERVICE ?=
# pytest-xdist workers for the API tests (measured: serial 34 s, 4 workers 25 s; use 0 to run serially in one process).
PYTEST_WORKERS ?= 4
# Port of the host web dev server: WEB_PORT in apps/web/.env or .env.local (make reads them), or `make dev-web WEB_PORT=3001`.
-include $(WEB)/.env
-include $(WEB)/.env.local
WEB_PORT ?= 3000
API_PORT ?= 8000
# `make dev-local` (no Docker): SQLite file under apps/api/.data instead of Postgres.
LOCAL_DB ?= sqlite+aiosqlite:///.data/dev.db
HAS_REDIS := $(shell command -v redis-server 2>/dev/null)

help: ## List targets
	@grep -hE "^[a-z0-9-]+:.*## " $(MAKEFILE_LIST) | sed -E "s/:.*## /\t/" | expand -t 16

install: ## Install API (uv) and web (pnpm) dependencies from the lock files
	cd $(API) && uv sync --frozen
	pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------------------------------------------

dev: ## Full stack in Docker (production-like) plus the local Garage S3 store. Builds an image only if its sources changed
	@test -f $(COMPOSE) || { echo "make dev: $(COMPOSE) not created yet (01-foundation task 6.1)"; exit 1; }
	@bash infra/scripts/build-changed.sh api
	@bash infra/scripts/build-changed.sh web
	@$(MAKE) --no-print-directory garage-up
	$(DC) -f $(COMPOSE_DEV) up --no-build

dev-web-stack: ## Stop stray web dev servers, start the Docker services except api and web (Postgres, Redis, Garage + bucket), then the web dev server on WEB_PORT
	@$(MAKE) --no-print-directory kill-web
	@$(MAKE) --no-print-directory dev-infra garage-up
	@$(MAKE) --no-print-directory dev-web

# Stops the host processes whose command matches PATTERN and whose working directory is DIR. Next allows one dev server
# per folder, so a forgotten one makes the next `make dev-web` fail. The Docker stack is not touched (see make down).
define stop_in
	@for pid in $$(pgrep -f '$(2)'); do \
		if [ "$$(readlink /proc/$$pid/cwd 2>/dev/null)" = "$(CURDIR)/$(1)" ]; then echo "stop $$pid: $$(ps -o args= -p $$pid | cut -c1-70)"; kill $$pid 2>/dev/null; fi; \
	done; true
endef

kill-web: ## Stop the web dev servers still running on this machine, whatever their port
	$(call stop_in,$(WEB),next)

kill-all: kill-web ## Stop every host dev process of the project (web, api, worker); Docker containers keep running (make down)
	$(call stop_in,$(API),uvicorn|arq)

dev-all: ## Everything in one terminal: Postgres, Redis and Garage in Docker, then API, worker and web on the host (Ctrl+C stops the three)
	@$(MAKE) --no-print-directory kill-all
	@$(MAKE) --no-print-directory dev-infra garage-up
	$(MAKE) -j3 --output-sync=line dev-api dev-worker dev-web

dev-local: ## Everything on the host, no Docker: API (SQLite) + web, plus Redis and the worker when redis-server is installed
	@mkdir -p $(API)/.data
	@test -n "$(HAS_REDIS)" || echo "make dev-local: redis-server not found: uploads are not analysed (demo, editor, store, sign-in work). Install redis-server or use make dev-infra"
	DATABASE_URL=$(LOCAL_DB) $(MAKE) -j4 --output-sync=line dev-api dev-web $(if $(HAS_REDIS),dev-redis dev-worker)

dev-redis: ## Redis on the host (needs redis-server): 127.0.0.1:6379, no persistence
	redis-server --bind 127.0.0.1 --port 6379 --save "" --appendonly no

dev-infra: ## Postgres + Redis + Garage (S3) only, published on 127.0.0.1 (then dev-api, dev-worker, dev-web on the host)
	$(DC) -f $(COMPOSE_DEV) up -d --wait postgres redis garage

garage-up: ## Start the local Garage S3 store and make sure its bucket and key exist (quiet; used by dev and up)
	@$(DC) -f $(COMPOSE_DEV) up -d --wait garage
	@bash infra/scripts/garage-init.sh >/dev/null 2>&1 || echo "make garage-up: garage-init failed, run make garage-init"

garage-init: ## One-time setup of the local Garage S3 store (bucket + key); prints the S3_* lines for apps/api/.env
	bash infra/scripts/garage-init.sh

dev-api: ## API on the host with reload: migrations then uvicorn on API_PORT (default 8000) (needs dev-infra; env: apps/api/.env)
	cd $(API) && uv run $(API_ENV_FILE) alembic upgrade head
	cd $(API) && uv run $(API_ENV_FILE) uvicorn music_world.main:create_app --factory --reload --port $(API_PORT)

dev-worker: ## Analysis worker on the host with reload (needs dev-infra; env: apps/api/.env)
	cd $(API) && uv run $(API_ENV_FILE) arq music_world.worker.WorkerSettings --watch music_world

dev-web: ## Next.js dev server on WEB_PORT (default 3000) (proxies /api to DEV_API_URL, default http://localhost:8000)
	pnpm -C $(WEB) dev -p $(WEB_PORT)

up: ## Start the Docker stack in the background (builds only what changed)
	@bash infra/scripts/build-changed.sh api
	@bash infra/scripts/build-changed.sh web
	@$(MAKE) --no-print-directory garage-up
	$(DC) -f $(COMPOSE_DEV) up -d --no-build --wait

down: ## Stop the Docker stack (volumes are kept)
	$(DC) -f $(COMPOSE_DEV) down --remove-orphans

restart: ## Restart one service or all: make restart SERVICE=api
	$(DC) restart $(SERVICE)

smoke: ## Smoke test of the running Docker stack (make smoke UP=1 starts it first)
	bash infra/scripts/smoke-dev.sh $(if $(UP),--up)

ps: ## Docker stack status
	$(DC) ps

logs: ## Follow Docker Compose logs: make logs [SERVICE=api]
	$(DC) logs -f --tail=100 $(SERVICE)

shell: ## Shell in a running service: make shell [SERVICE=api]
	$(DC) exec $(or $(SERVICE),api) sh

# ---------------------------------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------------------------------

build: ## Build the Docker images whose sources changed (api and worker share an image)
	@bash infra/scripts/build-changed.sh api
	@bash infra/scripts/build-changed.sh web

build-api: ## Build the api/worker image if its sources changed
	@bash infra/scripts/build-changed.sh api

build-web: ## Build the web image if its sources changed
	@bash infra/scripts/build-changed.sh web

rebuild: ## Force a rebuild of every image (Docker layer cache still applies)
	@bash infra/scripts/build-changed.sh api --force
	@bash infra/scripts/build-changed.sh web --force

# ---------------------------------------------------------------------------------------------------------------
# Test and check
# ---------------------------------------------------------------------------------------------------------------

test: test-api test-web ## Run API and web tests (no slow tests)

test-api: ## API tests (no slow tests)
	cd $(API) && uv run pytest -q -m "not slow" -n $(PYTEST_WORKERS)

test-web: ## Web tests
	@if [ -f $(WEB)/package.json ]; then pnpm -C $(WEB) test; else echo "[test] apps/web not scaffolded yet, skipped"; fi

check: schemas-check check-api check-web arch ## Lint + types + tests + architecture check (make -j3 check runs api and web in parallel)

check-api: test-api ## Lint, format check, types and tests of the API
	cd $(API) && uv run ruff check . && uv run ruff format --check . && uv run mypy

ocean-models: ## Rebuild the ocean life models (same bpy setup as `make models`)
	$(or $(PYTHON),python3) -I scripts/blender/build_ocean.py --out apps/web/public/models

models: ## Rebuild the 3D models with Blender (pip install bpy in a Python 3.13 venv, then PYTHON=<venv>/bin/python)
	$(or $(PYTHON),python3) -I scripts/blender/build_models.py --out apps/web/public/models

bundle-check: ## Build the web app and check the bundle budget (the 3D engine stays out of the light pages)
	pnpm -C $(WEB) build && pnpm -C $(WEB) check-bundle

check-web: schemas-check test-web ## Lint, types and tests of the web app
	@if [ -f $(WEB)/package.json ]; then pnpm -C $(WEB) lint && pnpm -C $(WEB) typecheck; fi

arch: ## Architecture rules (layers, no timers in the engine, no secrets in the web app)
	bash scripts/agents/validate-architecture.sh

lint: ## Lint only (no tests): ruff, mypy, eslint, tsc
	cd $(API) && uv run ruff check . && uv run mypy
	@if [ -f $(WEB)/package.json ]; then pnpm -C $(WEB) lint && pnpm -C $(WEB) typecheck; fi

format: ## Format the API (ruff). The web app has no repo formatter: format touched files only (see handoff)
	cd $(API) && uv run ruff check --fix . && uv run ruff format .

schemas: ## pydantic -> packages/schemas/*.schema.json -> apps/web/src/templates/generated (TS + zod)
	cd $(API) && uv run python scripts/export_schemas.py ../../packages/schemas
	pnpm --filter @music-world/schemas generate

GENERATED_HASH = cat packages/schemas/*.schema.json $(WEB)/src/templates/generated/*.ts 2>/dev/null | sha256sum

schemas-check: ## Fail if the generated schemas do not match the pydantic source
	@before=$$($(GENERATED_HASH)); $(MAKE) -s schemas >/dev/null; after=$$($(GENERATED_HASH)); \
	  [ "$$before" = "$$after" ] || { echo "Generated schemas were out of date: review and commit the regenerated files"; exit 1; }

# ---------------------------------------------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------------------------------------------

deploy: ## Deploy to OVHcloud over ssh: DEPLOY_HOST=user@host [DEPLOY_REF=sha] [DEPLOY_DOMAIN=domain] (skill deploy-ovh)
	bash infra/deploy.sh

check-env: ## Validate a production env file (default infra/.env; ENV_FILE=path), names only
	bash infra/scripts/check-env.sh $(ENV_FILE)

db-password: ## Local stack: set the Postgres user's password to the current infra/.env value (fixes "password authentication failed" on an old pgdata volume)
	$(DC) exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "ALTER USER \"$$POSTGRES_USER\" PASSWORD '"'"'$$POSTGRES_PASSWORD'"'"'"'
	$(DC) up -d --no-build --force-recreate api worker

dev-db-password: ## Host dev: give the Docker Postgres user the password found in DATABASE_URL of apps/api/.env (fixes "password authentication failed" in dev-api)
	@PW=$$(sed -n 's|^DATABASE_URL=[^:]*://[^:]*:\([^@]*\)@.*|\1|p' $(API)/.env 2>/dev/null | head -n1); PW=$${PW:-music_world}; \
	$(DC) -f $(COMPOSE_DEV) exec -T -e NEWPW="$$PW" postgres sh -c 'echo "ALTER USER \"$$POSTGRES_USER\" PASSWORD :'"'"'pw'"'"';" | psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -v ON_ERROR_STOP=1 -v pw="$$NEWPW"' \
	&& echo "Postgres password aligned with $(API)/.env"

# ---------------------------------------------------------------------------------------------------------------
# Disk: prune and clean. Docker volumes (pgdata, storage, Let's Encrypt certificates) are touched only by
# prune-volumes. Nothing here uses `docker ... prune -a`: other projects' images on this machine are left alone.
# ---------------------------------------------------------------------------------------------------------------

disk: ## Disk usage: filesystem, Docker, and the heavy local folders
	@df -h . | tail -1
	@docker system df 2>/dev/null || true
	@du -sh $(WEB)/.next $(API)/.venv node_modules .data 2>/dev/null || true

prune: ## Safe: dangling Docker images + build cache older than 7 days (no volume, no tagged image)
	docker image prune -f
	docker builder prune -f --filter until=168h

prune-images: ## Remove this project's images (stop the stack first: make down); the next make dev rebuilds
	-docker rmi music-world-api music-world-web
	rm -f .data/build/*.hash

prune-cache: ## Remove the whole Docker build cache (every project: next builds are cold)
	docker builder prune -af

prune-all: prune prune-images prune-cache ## prune + prune-images + prune-cache (still keeps every volume)

prune-volumes: ## DESTRUCTIVE: delete the Docker volumes (pgdata, storage, caddy). Needs CONFIRM=yes; refused if infra/.env is production
	@if [ -f infra/.env ] && grep -qE '^APP_ENV=production' infra/.env; then \
	  echo "prune-volumes: refused, infra/.env has APP_ENV=production (never delete production volumes)"; exit 1; fi
	@if [ "$(CONFIRM)" != "yes" ]; then \
	  echo "prune-volumes: deletes the local database, uploads and analysis results. Rerun with CONFIRM=yes"; exit 1; fi
	$(DC) -f $(COMPOSE_DEV) down -v --remove-orphans

clean: ## Remove build outputs and tool caches (.next, pycache, ruff, mypy, pytest, hypothesis, tsbuildinfo, image stamps)
	rm -rf $(WEB)/.next $(WEB)/tsconfig.tsbuildinfo $(API)/.ruff_cache $(API)/.mypy_cache $(API)/.pytest_cache \
	  $(API)/.hypothesis .ruff_cache .data/build
	find $(API) -name __pycache__ -type d -not -path "$(API)/.venv/*" -prune -exec rm -rf {} +

clean-deps: ## Remove node_modules and the API virtualenv (make install restores them; ~2.4 GB)
	rm -rf node_modules $(WEB)/node_modules packages/schemas/node_modules $(API)/.venv
