# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Phase 1 is **implemented and verified locally**. The app is a TypeScript ESM **pnpm monorepo**:
- `api/` — Fastify 5 backend (Drizzle ORM + `pg` → PostgreSQL 16), modular by domain under `api/src/modules/*`. App is assembled by `buildApp()` in `api/src/app.ts`; `api/src/server.ts` is the entry. Cross-cutting code lives in `api/src/platform/*` (authz/RBAC, storage, errors, context).
- `web/` — React 18 + Vite 5 SPA (`@tanstack/react-query`, `react-router-dom`). Routes/pages under `web/src/pages/*`; the typed API client mirroring `spec/api.md` is `web/src/lib/api.ts`.
- `spec/` — derived specs: `architecture.md`, `api.md` (the contract the SPA is built against), `data-model.md` (18 tables), plus the fixed `objective.md` and `local-dev.md`.
- 98 integration tests in `api/test/` exercise every `objective.md` requirement against a real seeded Postgres via `app.inject()`.

### Toolchain & commands
Toolchain is pinned by **mise** (`mise.toml`: node 22, pnpm 10). Prefix commands with `~/.local/bin/mise exec --` if mise isn't on PATH. Docker Engine runs Postgres.

```bash
# one-time host setup (Docker Engine + mise): scripts/setup-host.sh
pnpm install                       # install workspace deps
pnpm db:up                         # start Postgres (docker compose service "db")
pnpm db:migrate                    # apply Drizzle migrations
pnpm db:seed                       # idempotent truncate-then-insert demo fixtures
pnpm dev                           # run api (:3000) + web (:5173) in parallel; Vite proxies /api -> :3000

pnpm --filter @app/api test        # run the integration suite (reseeds DB first; needs db up)
pnpm --filter @app/api test -- recipes   # run one test file (vitest name filter)
pnpm build                         # tsc typecheck + vite build for both packages (the typecheck gate; no separate linter)
```

Env lives in `.env` at repo root (copy from `.env.example`): `DATABASE_URL`, `JWT_SECRET`, `STORAGE_*`, `PUBLIC_BASE_URL`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` (seeded admin). The api dev/test/migrate/seed scripts read it via node `--env-file`; vitest loads it in `api/test/setup.ts`.

## How this project is meant to be built

This is a demonstration of building a web application end-to-end with Claude Code using **Spec Driven Development (SDD)**. Two rules govern the work:

1. **`spec/objective.md` is fixed.** It is the immutable problem statement. Do not edit it, narrow it, or contradict it. Treat it as the source of truth for *what* to build.
2. **All other decisions are Claude Code's to make** — stack, architecture, schema, UI, tooling, and how the work is decomposed across sub-agents.

SDD means deriving intermediate specs/plans from the objective *before* writing code, so implementation stays grounded in the requirements rather than improvised. When adding a feature, trace it back to a clause in `spec/objective.md`. References for the approach:
- https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering
- https://github.com/github/spec-kit

Keep `spec/` as the home for derived specifications and plans (alongside the fixed `objective.md`).

## What the application must do (big picture)

`spec/objective.md` is the authoritative requirements; read it in full before planning. In summary, it describes a **recipe-sharing web app** with three distinct actor roles whose permission boundaries drive the architecture:

- **Guest** — browse/search/filter the recipe catalog, view recipe details and reviews, register/log in.
- **Registered user** — everything a guest can do, plus authoring recipes, favorites, cooking history/status ("cooked" / "want to cook"), comments & ratings, profile preferences (allergies, diets), author subscriptions with notifications, personalized recommendations, and a **"smart selection"** feature (suggest recipes from a list of on-hand ingredients).
- **Administrator** — authentication-gated management of all entities (recipes, categories, tags, cuisines, ingredients, users), moderation queues (submission requests, reviews, complaints), user blocking, content hide/delete, and usage statistics.

Two features carry the most domain logic and deserve explicit design: **smart selection** (ingredient-based matching) and **personalized recommendations** (derived from a user's cooked/saved recipes and stated dietary preferences). The dietary/allergy model (vegan, vegetarian, gluten-free, lactose-free) cross-cuts search, filtering, smart selection, and recommendations — design it once and reuse it.
