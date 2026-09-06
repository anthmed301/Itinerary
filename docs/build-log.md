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
| 1 — Auth + Profile | Sign up, log in, edit profile | ✅ **Done 2026-09-06** |
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

**Done 2026-09-06** on branch `phase-1-auth-profile`.

### In one sentence

The house now has a front door with a lock, and a name on the doorbell.

### What that means concretely

People can create an account, prove they own the email address, get back in after forgetting the password, and say who they are. Every trip built in later phases will belong to one of these accounts.

### What was built

| Piece | Plain English |
|---|---|
| Better Auth + four identity tables | Accounts, sessions, credentials, one-time tokens |
| `username` on the account row | Chosen at signup, unique, written in the *same insert* as the account — so you can never lose the name you picked between typing it and the account existing |
| `user_profile` | Bio and home city, kept in a separate table so a hiccup there can never block a signup |
| Mailer + escaped templates | Real emails, caught locally by Mailpit, with user-supplied text neutralised |
| `protectedProcedure` | The single gate every private API call passes through. Phase 4's roles build on it |
| Security headers, audit step, and the control tests | The OWASP work — see spec §5 |
| `APP_STAGE` | A new environment axis: "can strangers reach this", separate from "is this a production build" |

### Decisions that will outlive this phase

- **Username is chosen at signup** (D1.1), which means we accept a username-enumeration oracle by design — and rate-limit it rather than pretend it isn't one.
- **Username lives on the account row, not the profile** (D1.2). Signup is a single atomic insert and the unique index is the only arbiter, so an account is never created and *then* refused.
- **The profile row can fail without consequence** (D1.4) and is repaired on first read.
- **Verification emails are sent but don't gate login locally** (D1.5), so the pipeline is proven by a test rather than by a human clicking an inbox.
- **Security posture keys on `APP_STAGE`, never `NODE_ENV`** — because a laptop runs `NODE_ENV=production` every time it builds.
- **Undocumented library defaults are replaced with explicit rules.** Rate limits are stated, not inherited.

### What proves it works

| Evidence | Result |
|---|---|
| E2E against the **production build** (`turbo run start`) | **20 passed** |
| E2E in dev mode | 19 passed, 1 skipped (A10 exists only on the production path) |
| Unit tests | 54 passed (34 shared + 20 web) |
| `pnpm build` | clean — the review found this impossible before the fix |
| `pnpm audit --audit-level=high` | passes (1 moderate transitive dev advisory, no fix path) |
| Posture guard | fires at `APP_STAGE=cloud`, allows `local` |

### The part worth remembering

An independent review of the plan — before any code was written — found **four blocking defects**, and scored two rubric rows at 1. Every one of them was invisible to the plan's own twelve-row "verified facts" table, because those checks were *static*: typechecks, package greps, registry dates.

The sharpest was a Better Auth config that **compiles perfectly and returns HTTP 400 on every signup**. The phase would have been dead on arrival.

Applying the review then surfaced a **fifth** error nobody had predicted, the instant a real request was sent.

That is the phase's real lesson, and it is recorded as `docs/learnings.md` L19: **a typecheck is not a probe — run the request.**

### Honest limits

No TLS — everything is `http://localhost` until Stage 2, so `Secure` cookies and HSTS are not yet real. Nothing watches the auth logs; alerting is Stage 2–3. No SAST, no penetration test. Rate limits are per-instance and in-memory, and an unvalidated `x-forwarded-for` is honoured — fine on a laptop, a bypass the moment the app is reachable, so Stage 2 must set `trustedProxies`. Trip-level authorization does not exist until Phase 4. Signup still leaks membership on a duplicate email, which we accept alongside the username oracle.
