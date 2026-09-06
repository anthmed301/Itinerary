# Tripi — Build Log

> What was actually built, phase by phase, in plain language. This is the source for the end-of-build walkthrough: each entry says what shipped, why it mattered, and what proves it works.
>
> **How to use this:** one section per phase, appended when the phase's Definition of Done passes. Written to be read months later by someone who was not in the room — including future-you.
>
> Companion: `docs/learnings.md` (transferable lessons, not deliverables).

---

## Progress at a glance

| Phase | Goal | Status |
|---|---|---|
| 0 — Foundation | Monorepo, Docker, CI, vertical slice green from a production build | ✅ **Done 2026-09-05** |
| 1 — Auth + Profile | Sign up, log in, edit profile | 🔨 In progress |
| 2 — Trips/Days/Activities/Ideas | Full CRUD + drag-and-drop + ideas pool + place attachment | ⬜ |
| 3 — Realtime Collab | Multi-user live editing via Yjs + Hocuspocus | ⬜ |
| 4 — Invites + Roles | Owner/editor/viewer enforced end-to-end | ⬜ |
| 5 — AI Integration | All four AI features working | ⬜ |
| 6 — Social | Explore, likes, comments, follows, fork | ⬜ |
| 7 — Trip-Mode | Live timeline, check-ins, opt-in location | ⬜ |
| 8 — Polish + Pre-launch | Perf, accessibility, brand, marketing stub | ⬜ |
| 9 — Soft launch | Real invited users, monitor, fix | ⬜ |

**Stage:** 1 — Local (laptop only). Cloud entry is Stage 2, gated on Phase 2 completion. Phases and stages are independent axes: what the app *does* vs. where it runs and who can reach it.

---

## Phase 0 — Foundation

**Done 2026-09-05.** Merged as PR #1 (`a243ba4`). CI green on both triggers.

### In one sentence

Ran one wire from the street to a single lightbulb and proved it lights — no rooms yet, but the electricity works.

### What that means concretely

Phase 0 built **no features**. It proved two chains connect end to end, so that every later phase is plumbing into wiring that already works:

1. **The data chain.** Browser → tRPC (the typed API layer) → Drizzle (the database toolkit) → Postgres. The page renders `database: up` and `places cached: 0`, fetched live.
2. **The realtime chain.** Two browser windows sharing one counter through a self-hosted Hocuspocus server. Click Increment in one; the number moves in the other. This is the same machinery that will later sync days and activities between travel companions.

### What was built

| Piece | Plain English | Why it exists |
|---|---|---|
| `apps/web` | The website, plus the server code answering its questions | Next.js 16, App Router |
| `services/realtime` | The live-sync server | Makes two browsers agree, like Google Docs |
| `packages/shared` | The rulebook both must agree on | Database shape, trip-document shape, required settings |
| `docker-compose.yml` | Postgres + MinIO + Mailpit on your machine | No installing databases by hand |
| `.github/workflows/ci.yml` | Re-runs every check on every change | Catches what passes locally but breaks elsewhere |
| `scripts/preflight.mjs` | `pnpm preflight` — diagnoses a broken local setup | Machine state lives here, never in a plan |
| First migration | Versioned instructions for the `place` table | Schema changes are committed, never manual |

### Decisions that will outlive this phase

- **Three workspace units, not eight.** `docs/architecture.md` proposed eight; six config files before the first feature is not worth it solo.
- **Database code can never reach the browser.** Enforced by a lint rule that fails the build — tested in both directions, not left as a code-review convention.
- **Yjs is the only write path for trip content.** tRPC never edits days or activities. Prevents a split-brain where two systems overwrite each other.
- **The production build is what gets tested.** CI runs the end-to-end suite against `build` + `start`, not the development server. This caught a real bug that was invisible locally.
- **Postgres runs on port 5433**, because a Homebrew Postgres already owned 5432 for an unrelated project.
- **AWS deploy moved out of Phase 0** to Stage 2, recorded as a decision rather than a silent deletion.

### What proves it works

| Evidence | Result |
|---|---|
| CI on pull request | ✅ run `33975103512` |
| CI on push to main | ✅ run `33980306008` |
| Definition of Done, cold cache | ✅ 19/19 |
| **Clean clone from GitHub, README followed verbatim** | ✅ **14/14** |
| End-to-end tests against the production build | ✅ 3 passed |
| Unit tests | ✅ 15 passed |

The clean-clone run is the strongest signal: a fresh checkout, following only the README, reached a working two-tab sync. Nothing depended on the machine it was built on.

### Honest limits

Phase 0 proved wiring, not product. Nothing is deployed. Authentication is a permissive stub with a guard that refuses to start in production. The counter is last-writer-wins, not a real collaborative-editing pattern. Hocuspocus is a single instance. `place` is the only table. `docs/` still describes Next 15 / Zod 3 / Hocuspocus 2 — stale, bridged by the plan's deviations table.

### Cost of the surprises

Thirteen commits. Eleven findings that the written plan did not predict — see `docs/learnings.md`. The two that would have hurt most were invisible until the production build ran in CI.

---

## Phase 1 — Auth + Profile

*In progress. Section written when the phase's Definition of Done passes.*
