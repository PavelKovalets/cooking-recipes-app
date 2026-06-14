# Local development & dependencies

Companion to [`architecture.md`](./architecture.md). It fixes the **technology stack** (left open by the architecture) and lists exactly what must exist on a developer machine to **implement and test Phase 1 locally**. Scope is Phase 1 (§1.1 of the architecture) — the background worker, scheduler, queue, and CDN are out of scope here.

## 1. Stack decision

**TypeScript full-stack.**

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend runtime | **Node.js LTS (22.x)** | One language across front and back. |
| Backend framework | **Fastify** | Lean HTTP layer; maps cleanly onto the §4 module folders. |
| ORM / migrations | **Drizzle ORM** + `drizzle-kit` | SQL-first — fits the "do search & matching in raw-ish SQL" philosophy (§6) better than a heavy abstraction. |
| DB driver | **`node-postgres` (`pg`)** | Standard PostgreSQL client. |
| Frontend | **React + Vite + TypeScript** | Fast SPA toolchain; static build served by the API in Phase 1. |
| Package manager | **pnpm** (via Corepack) | Fast, disk-efficient workspaces (monorepo: `api/` + `web/`). |

**Why TypeScript full-stack:** an SPA build step requires Node.js *regardless* of backend language, so choosing Node for the backend too means **one runtime and one language** — the simplest setup for a solo project, which is the architecture's prime directive.

**Alternative considered — Python backend (FastAPI):** viable (Python 3.13 is already installed) but means maintaining **two runtimes**, since the SPA still needs Node. Rejected for Phase 1 on simplicity grounds. The `platform/` seams (§4) keep this reversible.

## 2. Host prerequisites

Only two things are installed at host level; everything else is either managed by **mise** or runs as a container. One command does it all: `bash scripts/setup-host.sh`.

### 2.1 Docker Engine (system daemon — installed separately)

A container runtime is required for Postgres, the storage emulator, and building/running the API image (Cloud Run parity). On Linux use **Docker Engine, not Docker Desktop** — lighter, free (Apache-2.0), and no nested VM (this box is already an Azure VM). The setup script installs it from Docker's official apt repo with the Compose v2 plugin (`docker compose`). It is *not* managed by mise because it is a privileged system daemon, not a user-space tool.

### 2.2 mise — single version manager for the rest

[mise](https://mise.jdx.dev) installs the project toolchain from the committed [`mise.toml`](../mise.toml), so versions are pinned and reproducible (SDD-friendly). `mise install` provides:

| Tool (via mise) | Version | Needed for |
|-----------------|---------|-----------|
| **Node.js** | 22 (LTS) | Backend runtime + frontend build/test |
| **pnpm** | 10 | Dependency management (`api/` + `web/` workspaces) |

Deploy-time tools (Terraform, gcloud) are listed in `mise.toml` too, commented out, to enable later (architecture §10).

**Why mise instead of nvm + corepack:** one tool pins every language/CLI version per-project in `mise.toml`, rather than juggling nvm, corepack, and standalone installs.

> *build-essential (`make`, `g++`) is needed only if the native npm modules (`argon2`, `sharp`) lack prebuilt binaries for your platform — usually not the case.*

Already present and sufficient: **git**, **jq**. **Python 3.13** is present but unused under the chosen stack.

## 3. Backing services — run as containers, no host install

| Service | Image | Why |
|---------|-------|-----|
| **PostgreSQL 16** | `postgres:16` | Provides `tsvector` full-text, `GIN` indexes, `jsonb` — everything Phase 1 search/smart-selection needs. |
| **Cloud Storage emulator** *(optional)* | `fsouza/fake-gcs-server` | GCS has no official emulator. Use it for integration tests that exercise signed-URL upload/download. |

**Media in local dev:** the `BlobStore` interface (§4) gets a **local-filesystem adapter** for everyday dev and unit tests, so no emulator is required to run the app. `fake-gcs-server` is only for integration tests that need real GCS-style signed URLs. Signed-URL semantics differ slightly in the emulator — keep those tests minimal.

**`pgvector` is NOT a Phase 1 dependency** — it is a Phase 2 upgrade path for embedding-based recommendations (architecture §6.3). Plain `postgres:16` is enough.

## 4. IaC / deploy-time tooling — NOT required for local app testing

| Tool | When needed |
|------|-------------|
| **Terraform or OpenTofu** | Authoring + `validate`/`plan` of Phase 1 infrastructure. No faithful local emulator exists for GCP resources, so IaC is only truly exercised against real GCP. |
| **gcloud CLI** | Actual deployment only — auth, pushing the image to Artifact Registry, applying infra. |

The full app runs and is tested locally via Docker Compose **without** either of these. Both can be version-pinned alongside Node/pnpm by uncommenting them in [`mise.toml`](../mise.toml); install only when moving to deploy.

## 5. Application libraries (installed via `pnpm install`, not manually)

Listed for reference — these are resolved by the package manager, not host dependencies.

- **Backend:** `fastify`, `drizzle-orm`, `drizzle-kit`, `pg`, `jose` (JWT), `argon2` (password hashing), `zod` (validation), `@google-cloud/storage`, `sharp` (image resize — optional in Phase 1).
- **Frontend:** `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `vite`, `@vitejs/plugin-react`.
- **Testing:** `vitest`, `@testcontainers/postgresql` (spins an ephemeral Postgres so the in-DB features — full-text search, ingredient matching — are tested against a real engine, not a mock).

## 6. Local dev & test workflow (target)

1. `mise install` — install the pinned Node + pnpm (once; or run `scripts/setup-host.sh`).
2. `docker compose up -d` — starts Postgres (and `fake-gcs-server` if enabled).
3. `pnpm install` — once, at the monorepo root.
4. `pnpm --filter api migrate` — apply `drizzle-kit` migrations.
5. `pnpm dev` — runs the API and the Vite dev server (proxying API calls).
6. `pnpm test` — unit tests + Testcontainers-backed integration tests (Docker required).

Config via 12-factor env vars (architecture §8); a committed `.env.example` documents them. No real secret store needed locally — env vars stand in for Secret Manager.

## 7. Minimum to get started

Run **`bash scripts/setup-host.sh`** — it installs Docker Engine + mise, then `mise install` pins Node + pnpm. Postgres and the storage emulator come up as containers; Terraform and gcloud are deploy-time only.
