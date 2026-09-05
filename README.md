# Tripi

The trip-planning document that replaces the spreadsheet. Collaborative, AI-aware,
and alive during the trip itself.

- Product source of truth: `PRD.md`
- Technical specs: `docs/`
- Review findings and the docs backlog: `docs/prd-review-2026-09-05.md`
- Conventions and local gotchas: `CLAUDE.md`

## Getting started

Requires Node 24, pnpm 11, and Docker Desktop running.

```bash
nvm use
corepack enable
pnpm install

cp .env.example .env.local
sed -i '' "s|^HOCUSPOCUS_JWT_SECRET=.*|HOCUSPOCUS_JWT_SECRET=$(openssl rand -hex 32)|" .env.local

# Next reads env files only from the directory it starts in, so apps/web
# needs its own link to the canonical root file:
ln -s ../../.env.local apps/web/.env.local

pnpm db:up
pnpm db:migrate
pnpm dev
```

Then open http://localhost:3000. You should see `database: up`,
`up · superjson: ok`, and a realtime counter reading `synced`. Open a second
window and click Increment — the number moves in both.

On Linux, `sed -i` takes no `''` argument.

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm preflight` | Diagnoses a broken local setup. Run this first when something misbehaves. |
| `pnpm dev` | Both services with hot reload (web on 3000, realtime on 1234). |
| `pnpm build && pnpm start` | The production path — what CI runs the e2e suite against. |
| `pnpm lint` / `pnpm format` | Biome check / autofix. |
| `pnpm typecheck` / `pnpm test` | TypeScript and unit tests across the workspace. |
| `pnpm e2e` | Playwright against dev servers. `CI=1 pnpm e2e` runs against the build. |
| `pnpm db:up` / `db:down` / `db:reset` | Postgres, MinIO, Mailpit via Docker Compose. |
| `pnpm db:generate` / `db:migrate` | Drizzle migration files and applying them. |

It is `pnpm preflight`, not `pnpm doctor` — pnpm 11 has a built-in command by
that name which would shadow the script.

## Local services

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost:3000 | |
| Realtime (Hocuspocus) | ws://localhost:1234 | Runs on the host, not in Docker. |
| Postgres | `localhost:5433` | **5433, not 5432** — see `CLAUDE.md`. |
| Mailpit inbox | http://localhost:8025 | Unused until Phase 1. |
| MinIO console | http://localhost:9001 | Login `minio` / `minio12345`. Unused until Phase 1. |
