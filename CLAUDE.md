# Tripi

Trip-planning web app. Replaces Google-Sheets planning with a focused, AI-aware document. Real-time collaborative; social Explore; trip-mode that activates when travel starts.

## Read first
- `PRD.md` — product source of truth: problem, requirements, phases, stage gates, open decisions, decision log. (`PLAN.md` is retired.)
- `docs/prd-review-2026-09-05.md` — review findings + the docs/ consistency backlog; read before editing any `docs/` file.
- `docs/plan-review-rubric.md` — the gate every phase plan passes before execution. Reviews live at `docs/plan-review-<phase>-<date>.md` (Phase 0: `docs/plan-review-phase-0-2026-09-05.md`).
- `docs/architecture.md` — monorepo + AWS topology.
- `docs/data-model.md` — Drizzle schema + LexoRank.
- `docs/api.md` — tRPC routers.
- `docs/realtime-collab.md` — Yjs + Hocuspocus.
- `docs/ai-integration.md` — Gemini + Tavily prompts.
- `docs/trip-mode.md` — live trip view spec.
- `docs/design-system.md` — three brand directions, tokens, motion, DnD spec.
- `docs/security.md` — auth + authz + secrets + privacy.
- `docs/ops.md` — local dev, CI/CD, deploy, observability, costs.
- `docs/competitive-analysis.md` — market gaps and positioning.

## Working agreements (project-specific)
- v1 is **web-only**. iOS is post-v1.
- Auth is **Better Auth, email + password only** for v1. No OAuth, no magic link.
- Realtime collab is **self-hosted Yjs + Hocuspocus on AWS**. Don't propose Liveblocks/PartyKit.
- DB during POC is **local Docker Postgres**. Managed RDS at launch.
- AI is the **current free-tier Gemini Flash-class model** during POC (1.5 Flash is retired; 2.5 Flash retires 2026-10-16). Model id lives in config, re-verified at Phase 5.
- **Yjs is the only write path for trip content** (meta/days/activities). tRPC never edits those rows.
- Viewer role at the realtime layer = Hocuspocus `connection.readOnly`, not a persistence-side skip.
- Days are positional; dates derive from `trip.startDate + index`. Trips may be undated.
- All AI place suggestions must round-trip through Foursquare for verification.
- All trip-scoped DB queries join through `trip_member` for authorization.
- Drag-and-drop in the trip view goes through Yjs in real-time, not tRPC.
- Trip-mode in v1 = timeline + check-ins + opt-in shared location. **No group chat.**
- Privacy: 3 states (private / unlisted / public). Private default.
- Roles: owner / editor / viewer.
- Forks of public trips are allowed and credit the original.
- Monetization is deferred to v2; entitlement scaffolding lives on `trip.entitlements` JSONB.

## Working agreements (process)
- A phase plan is executed only after a review against `docs/plan-review-rubric.md` with no row scored 1.
- Plans probe, never assert: any "X does Y" claim about a framework or CLI carries a command with expected output, or a citation that was opened.
- `pnpm build` and every service's `start` script run locally and in CI from Phase 0 onward; dev-only green does not count.
- Machine state (Node version, daemons, ports) lives in `pnpm preflight`, never in a plan. (Not `pnpm doctor` — pnpm 11 ships a built-in command by that name that shadows the script.)
- Boundaries are enforced by tooling (subpath exports, Biome restricted imports), not prose.
- PRD deviations are decision-log rows in `PRD.md` §10; `docs/` deviations go to the plan's deviations table and the backlog in `docs/prd-review-2026-09-05.md` §3.

---

## Pinned stack (Phase 0, 2026-09-05)
Node 24 · pnpm 11.25.0 · Turbo 2.10.12 · TypeScript 7.0.2 · Next 16.3.4 · React 19.2.8 ·
Tailwind 4.3.3 · tRPC 11.18.0 · Drizzle 0.45.2 · Postgres 17.11 · Zod 4.5.4 · Yjs 13.6.32 ·
Hocuspocus 4.6.0 · Biome 2.5.12 · Vitest 4.1.11 · Playwright 1.62.1 · Lefthook 2.1.12 ·
tsdown 0.22.14 · @types/node 24.13.3

Exact versions, no carets. **Selection policy:** newest release that is ≥2 weeks old with ≥1
patch on its major, else the previous stable. Type packages track the runtime major. Container
images pinned to a tag. pnpm 11 enforces part of this itself via `minimumReleaseAge` — if it
offers to write a `minimumReleaseAgeExclude` entry, take the older version instead.

`docs/` still says Next 15 / Zod 3 / Hocuspocus 2 — stale, ignore.

## Monorepo shape
Three units, not the eight in `docs/architecture.md` §2:
- `apps/web` — Next app, all UI + tRPC + server modules
- `services/realtime` — Hocuspocus server; `tsx watch` in dev, bundled by tsdown for prod
- `packages/shared` — Drizzle schema, Yjs doc shape, Zod env contract. Imports nothing from the other two.

Docker runs postgres + minio + mailpit only.

## Server/client boundary
`@tripi/shared` (the barrel) is **browser-safe** and must stay that way: it re-exports types and
the Yjs helpers, nothing else. `@tripi/shared/env`, `@tripi/shared/db`, and
`@tripi/shared/db/schema` are server-only, restricted by Biome `noRestrictedImports` to
`apps/web/src/server/**`, `apps/web/src/app/api/**`, and `services/realtime/**`.

- Never re-export db or env from the barrel — that is what puts the Postgres driver in the browser bundle.
- Never add the `server-only` package to `packages/shared`; it throws outside a React Server environment and would break the realtime service.
- SQL lives only in `packages/shared/src/db/`. A tRPC router that imports `sql` from `drizzle-orm` is the boundary leaking — add a query function to `db/client.ts` instead. pnpm's strict layout catches this as `Module not found: Can't resolve 'drizzle-orm'`.

## Local environment gotchas (found while building Phase 0)
- **Postgres is on host port 5433**, not 5432. A Homebrew `postgresql@17` (database `album_app`) owns 5432 and auto-starts at login. CI uses 5433 too so `DATABASE_URL` matches everywhere.
- **`.env.local` lives at the repo root**; `apps/web/.env.local` is a **symlink** to it, because Next reads env files only from the directory it starts in. Without the link the page renders `database: down` and `NEXT_PUBLIC_*` never reaches the browser. `pnpm preflight` checks the link resolves.
- **`pnpm preflight`, never `pnpm doctor`** — pnpm 11's built-in `doctor` shadows the script and reports green regardless.
- **`pnpm-workspace.yaml` needs `allowBuilds`** for `lefthook` and `esbuild`; pnpm 11 blocks install scripts by default and their binaries silently never appear.
- **`agentRules: false` in `next.config.ts`** — Next 16 otherwise generates `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` on first dev run, competing with this file.
- **tsdown's `deps.alwaysBundle` must be a RegExp** (`/^@tripi\/shared(\/.*)?$/`). A bare string matches only the exact specifier and leaves subpath imports external — and the resulting artefact still *runs* today, breaking later in Phase 3. Check the bundle content, not the exit code.

## Phase 0 conventions
- Lint and format is Biome (`pnpm lint`, `pnpm format`). No ESLint, no Prettier. Generated output (`packages/shared/migrations`) is excluded — never lint what a generator rewrites.
- Drizzle table extras use the array callback form; the object form in `docs/data-model.md` is the old API.
- Coordinates are `doublePrecision`, not `decimal` — Drizzle returns `decimal` as strings.
- Next 16: `params` is a Promise, and middleware would live in `proxy.ts`, not `middleware.ts`.
- Every phase runs `build` and `start`, not just `dev`. CI e2e runs against the build.
- Realtime tests assert on `synced`, never on `connected` — the socket opens before the document arrives.

