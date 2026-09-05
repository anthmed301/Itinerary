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
- Machine state (Node version, daemons, ports) lives in `pnpm doctor`, never in a plan.
- Boundaries are enforced by tooling (subpath exports, Biome restricted imports), not prose.
- PRD deviations are decision-log rows in `PRD.md` §10; `docs/` deviations go to the plan's deviations table and the backlog in `docs/prd-review-2026-09-05.md` §3.
