# PRD Review — 2026-09-05

> Reviewer's report on `PRD.md` and the `docs/` bundle. Findings are ranked by how much they would hurt if discovered during a build rather than now. The PRD was edited in the same pass (see §8); the original is preserved in the scratchpad backup `PRD.original.md` and in the decision log.

---

## 1. Verdict

The doc set is unusually complete for a solo project: clear problem statement, explicit out-of-scope list, a decision log with reasons, three-layer authz, and a realistic "lean now, harden later" ops stance. It would pass a senior design review with a handful of required changes.

Three things are wrong enough to fix before Phase 0:

1. **Viewer-role enforcement in realtime is broken as designed** (§2.1). Fixable in one line.
2. **Two write paths to the same rows** (tRPC mutations and the Yjs flush) will silently lose edits (§2.2). Fix by picking one.
3. **Two external dependencies are stale or non-compliant**: the pinned Gemini model no longer exists, and the `place` cache violates Foursquare's caching terms (§2.3, §2.4).

Everything else is either an edge case to write down (§4) or a simplification that makes the build easier (§6).

## 2. Critical findings

### 2.1 Viewer edits reach other clients and get persisted anyway

`docs/realtime-collab.md` §6 enforces the viewer role by having the persistence extension skip the flush when `context.role === 'viewer'`. That does not work: the viewer's update has already been applied to the in-memory `Y.Doc` and broadcast to every other client. The next flush triggered by *any editor* writes the whole document, including the viewer's change. Net effect: viewers can edit.

**Fix:** set `data.connection.readOnly = true` in `onAuthenticate` for viewer JWTs. Hocuspocus rejects updates from read-only connections before applying them ([docs](https://tiptap.dev/docs/hocuspocus/guides/authentication), [discussion](https://github.com/ueberdosis/hocuspocus/discussions/302)). Delete the role check from the persistence extension.

**Related:** a removed or demoted member keeps a valid JWT for up to 30 minutes and Hocuspocus does not re-authenticate mid-connection ([issue](https://github.com/ueberdosis/hocuspocus/issues/566)). Add a tiny internal endpoint on the realtime service (`POST /internal/disconnect { tripId, userId }`, shared secret) that `tripMember.remove` / `updateRole` call. Also shorten the JWT to ~5 minutes; the provider can fetch a fresh one on reconnect.

### 2.2 Split-brain between tRPC content mutations and the Yjs flush

`docs/api.md` §4.2 defines `day.*` and `activity.*` mutators plus `trip.update`, and says they are for "non-collab paths". `docs/realtime-collab.md` §3.2 says the Yjs binary is loaded once and is then the truth. So: user A has the trip open (doc in memory), user B (or the AI, or a future iOS client) calls `activity.update` via tRPC. The row changes. The next flush from A's doc overwrites it. There is no event that pushes a row change into a loaded doc.

**Fix (recommended):** make Yjs the *only* write path for trip content (meta, days, activities). Rows in `day` and `activity` become a read projection maintained solely by the flush. Remove `day.*`, `activity.*`, and the content half of `trip.update` from the tRPC surface. Non-content mutations stay in tRPC (members, invites, privacy/publish, likes, comments, check-ins, location). This deletes roughly a third of the API you planned to build and test, and removes an entire class of bugs. Server-initiated content edits (AI auto-planner, forks) are applied client-side through the same Yjs path, or via Hocuspocus `server.openDirectConnection()` if a server-only path is ever needed.

**Also guard the flush:** the `trip` meta update in the flush must only touch content columns (`title, summary, destination, startDate, endDate, coverImageKey`) and never `privacy`, `ownerId`, `publishedAt`, counters. Write this as a test.

### 2.3 The pinned AI model does not exist any more

Gemini 1.5 Flash (PRD, `CLAUDE.md`, `docs/ai-integration.md` §2–3) was retired in 2025. Gemini 2.0 Flash was removed from the free tier in June 2026, and Gemini 2.5 Flash is scheduled to shut down on 2026-10-16 with `gemini-3.5-flash` as the replacement ([deprecations](https://ai.google.dev/gemini-api/docs/deprecations), [summary](https://pocketlantern.dev/briefs/gemini-2-0-and-2-5-model-shutdowns-and-replacements-2026)). The comparison table in `ai-integration.md` §2 (Claude Haiku 3.5, GPT-4o-mini) is equally stale.

**Fix:** treat the model id as config, not a decision. Re-verify the free-tier model when Phase 5 starts, not now. The PRD now says exactly that. When you get there, re-check the Vercel AI SDK too: the `tool({ parameters })` shape in `ai-integration.md` §3.1 is the v4 API; v5 renamed it to `inputSchema`.

### 2.4 The `place` table violates Foursquare's caching terms

`docs/data-model.md` §2.3 caches `name, category, address, lat, lng, data(hours, photos)` indefinitely in `place`, and `architecture.md` §9.5 says "cached in Postgres before being returned to clients." Foursquare's usage guidelines (per [their API terms](https://foursquare.com/legal/terms/apilicenseagreement/) and this [caching-policy comparison](https://openplacesapi.com/blog/can-you-store-places-api-results)) allow storing `fsq_place_id`, photo ids, and address ids indefinitely, and POI metadata for at most 24 hours. Names, hours, coordinates are not cacheable long term. This matters more than it sounds: public trip pages and Explore render pins from `place.lat/lng`.

**Options:**
- **(a) Comply with a TTL.** Keep `place` as a 24h cache with refresh-on-read (`refreshedAt` already exists). Cheap for private trips; for public pages, pins on trips nobody has opened in a day trigger a refresh per place. Acceptable at Stage 1–3.
- **(b) Use an open dataset for place facts.** Foursquare's own [FSQ OS Places](https://foursquare.com/products/places-api/) release and Overture Maps are openly licensed and carry no caching restriction, but self-hosting them is a real project. Stage 4 escape hatch.
- **(c) Google Places.** Allows longer caching of some fields, costs money, already listed as the backlog swap-in.

**Recommendation:** (a) for v1, and read the current Usage Guidelines page yourself before Phase 2 — the summary above is from secondary sources. Recorded as an open decision in PRD §9.

### 2.5 `requireTripAccess` cannot authorize half the procedures

`docs/data-model.md` §4 reads `input.tripId`. Most procedures take `dayId`, `activityId`, `commentId`, `token`, or `userId` instead, and public/unlisted trips have viewers with no `trip_member` row at all (`trip.byId` for a stranger on a public trip, `trip.social.like` "viewer+", `trip.fork` on public). As sketched, either those procedures skip the middleware (an authz hole) or they 403 legitimate users.

**Fix:** one `resolveTripAccess(ctx, { tripId | activityId | dayId | commentId, shareToken? })` helper that returns `{ tripId, role: 'owner'|'editor'|'viewer'|'public'|'unlisted'|null }` after resolving the parent trip, checking membership, then privacy + HMAC share token. Every procedure calls it. The authz test matrix should include a fifth actor, `anonymous`, and a sixth, `link-holder`. Adopting §2.2 shrinks the surface this has to cover.

## 3. Consistency issues across PRD and docs

Each is a one-line fix; the PRD says docs must not contradict it, so these are your backlog for the docs.

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | `CLAUDE.md` Read-first | Still lists `PLAN.md` as the index; it is retired | Point at `PRD.md` (**fixed in this pass**) |
| 2 | `architecture.md` §2, §4 | Still ships `infra/` CDK and a `preview` env with "branched RDS" (RDS has no branching; that is Neon) | Mark `infra/` future; drop `preview` env until Stage 3 |
| 3 | `architecture.md` §7, `security.md` §7, `data-model.md` §9 | Six "nightly Lambdas" plus a post-upload `sharp` Lambda, but ops says no IaC and no Lambdas | See §6.4: one scheduled job route + client-side image resize |
| 4 | `data-model.md` §9 vs `architecture.md` §7 vs PRD §9 | Yjs history: "compacted every 7 days" / "drops history > 30 days" / "nightly GC, 1MB cap" | Pick one: nightly compaction, keep only the latest state (no history), warn at 1MB |
| 5 | `realtime-collab.md` §3.1 | Uses `trip.yjsState`, `trip.yjsStateUpdatedAt`; `data-model.md` has neither | Add both columns (bytea, timestamptz) |
| 6 | `api.md` §10, `security.md` §10 | `mutation_log` and `report` tables are not in the 15-table schema | Add or drop `mutation_log` (see §6.6) |
| 7 | `data-model.md` §2.3 vs `realtime-collab.md` §1 | Days are ordered by `orderKey` in Postgres but by array position in Yjs; `day.date` is NOT NULL but trips can be undated | Days become positional with derived dates (PRD §4.2, applied) |
| 8 | `api.md` §4.1 vs `security.md` §4.5 | Fork allowed for "any user with view access" vs "private → 403" | A private trip's own members may fork; strangers may not |
| 9 | `api.md` §4.4 | `tripMember.leave` "not allowed if you're the only owner" implies multi-owner; `trip.ownerId` is single | Single owner + `transferOwnership` (PRD §4.4, applied) |
| 10 | `api.md` §4.8 | `signActivityImageUrl` exists; `activity` has no image column; trip-mode "photos uploaded during the trip" has no table | Add `activity_image` table or drop the endpoint from v1 |
| 11 | `security.md` §6 | Better Auth session secret is shared with Hocuspocus; it only needs the JWT secret | Least privilege: JWT secret only |
| 12 | `trip-mode.md` §1 | Timezone guessed from "activity with most locations" | `trip.timezone` IANA column (PRD §4.7, applied) |
| 13 | `design-system.md` §13 vs PRD §5 | "You're offline. Edits will sync" banner vs "no offline write support" | PRD §6 now distinguishes in-session disconnect tolerance (yes) from persisted offline mode (no) |
| 14 | `security.md` §11 | Cookie consent banner | Only a strictly-necessary session cookie is set; no analytics cookies means no banner is required. Drop it until you add analytics |
| 15 | `security.md` §11 | DOB collection for COPPA | An "I am 13 or older" attestation collects less PII and is the common pattern; DOB is optional |
| 16 | `api.md` §3 | `ctx.req.ip` behind Amplify/ALB | Read the first `X-Forwarded-For` hop; otherwise every user shares one bucket |
| 17 | `security.md` §2 | `cookieCache` 5 min makes "sign out everywhere" up to 5 min stale | Accept and document, or disable the cache |
| 18 | `data-model.md` §2.3 | Comment "NOT NULL is enforced by app logic" on `dayId` contradicts the ideas-pool design | Delete the comment; nullable is intended |

## 4. Missing edge cases (now written into the PRD where marked ✔)

**Trips and days**
- ✔ Trip with no dates yet ("Day 1, Day 2"). Very common while planning. Fixed by positional days.
- ✔ Shifting the whole trip by a week. Fixed by derived dates.
- ✔ Timed vs untimed activities in one day; drag order disagreeing with times. Rule: drag order wins, UI warns.
- ✔ Undo/redo. A Sheets replacement without Cmd+Z will feel broken. Yjs `UndoManager` gives per-user undo almost for free.
- Multi-city trips: one `destination` and one timezone per trip. Acceptable for v1; state it. Lodging and transport legs: see open decision in PRD §9.
- Activity crossing midnight (`endTime < startTime`). Decide: allowed, treated as ending next day.
- Deleting a day that has activities: move them to the ideas pool, do not delete.
- Yjs doc at the 1MB cap: block new activities with a message, do not silently drop.

**Membership**
- ✔ Single owner, ownership transfer, owner cannot leave without transferring.
- ✔ Invite expiry (7d), single-use, in-app delivery when the email already has an account, any signed-in account may accept.
- ✔ Removal/demotion takes effect on live connections immediately.
- Inviting someone who is already a member, or re-inviting a pending email: return the existing state, do not create duplicates (unique on `(tripId, emailLower) WHERE acceptedAt IS NULL`).
- ✔ Account deletion when the user owns trips with other members.
- Deleting a trip while collaborators have it open: unload the doc and close connections with a reason code the client turns into the "access changed" modal.

**Privacy and social**
- Unpublishing while someone has the public page open: fine (SSR), but the 60s HTTP cache means it can linger a minute. Document.
- Forking a trip that is in trip-mode: copy days/activities only, never check-ins, location, comments, or the Yjs binary (seed a fresh doc from rows).
- Forks of a trip later deleted: `forkedFromTripId` is not an FK; render "original trip no longer available".
- FTS uses the `english` config; non-English destinations search poorly. Use `simple` for destination and titles.

**Trip-mode**
- ✔ No `endDate` means location data never expires. Rule: sharing requires an end date.
- ✔ Check-ins are polled (~30s), not realtime. The PRD's "instant" promise now applies to planning edits only.
- No activity has times: NOW/NEXT fall back to first un-checked-in activity in drag order.
- Every activity checked in: NOW shows "Day done"; NEXT shows tomorrow's first.
- User's device clock wrong: server-provided `now` (already in `trip-mode.md` §9) — keep.

**Realtime and persistence**
- ✔ Single write path (§2.2).
- Flush transaction fails 3× (Postgres down): keep serving from memory, mark doc dirty, alarm. Never drop the doc from memory while dirty.
- Server restart with a dirty doc: unavoidable loss window; `onDisconnect` flush and a 5s cadence bound it. Document the bound as an accepted risk.
- Two tabs, same user: works (two connections, same identity); presence should dedupe by `userId`.

**Uploads**
- S3/MinIO need a CORS policy for browser `PUT`. Put it in `docker-compose` (MinIO) and the manual AWS checklist.
- Client-side resize before upload removes the `sharp` Lambda and the 8MB ceiling problem (see §6.4).

**Email**
- SES sandbox only delivers to verified addresses until production access is granted (about a day). This is a Stage 3 gate, now in PRD §7b.
- Local dev: route email to a Mailpit container, and make `requireEmailVerification` an env toggle so signup works offline.

## 5. Scaling path — what actually changes at each stage

Added to the PRD as §7b. The important idea: **phases are features, stages are deployment maturity, and they are independent axes.** The same codebase and the same `docker-compose.yml` should carry you from Stage 1 to Stage 3; Stage 4 is where the AWS-native topology in `ops.md` earns its keep.

What was missing from the original: gates are stated as "before public launch" or "when it hurts", which for a solo builder with no deadline means "never quite now". §7b turns them into checklists with a concrete trigger per stage.

## 6. Developer-experience options

Ranked by leverage. Each one is a scope *cut*, not an addition.

### 6.1 Collapse the monorepo to three units
`architecture.md` §2 plans two apps and six packages (`db, config, ui, tokens, yjs-schema, test-utils`) plus a future `docs-site` and `marketing`. For one person this is six `package.json` files, six build configs, and Turbo pipeline debugging before the first feature. Start with:

```
apps/web            Next.js (all UI, tRPC, auth, AI, tokens, components)
services/realtime   Hocuspocus
packages/shared     Drizzle schema + migrations, Yjs doc helpers, env schema
```

Split `ui`/`tokens` out only when a second app (marketing, iOS) actually imports them. Everything in `architecture.md` §9 (the boundaries) still holds; boundaries are folders, not packages.

### 6.2 Run Hocuspocus outside Docker in dev
`ops.md` §1.1 builds the realtime server into Docker Compose. That means a rebuild for every change to it. Run it as a Turbo `dev` task with `tsx watch`; keep Docker for Postgres, MinIO, and Mailpit only. Your `pnpm dev` then hot-reloads both services.

### 6.3 Yjs as the single content write path (§2.2)
Deletes `day.*`, `activity.*`, `activity.batchReorder`, most of `trip.update`, their Zod schemas, their authz matrix rows, and the idempotency middleware for them. Roughly a third of the API surface, gone.

### 6.4 One scheduled-jobs route instead of six Lambdas
Every nightly job in the docs (location purge, `ai_generation` purge, soft-deleted comment purge, account deletion cascade, orphaned S3 cleanup, Yjs compaction) becomes one function in `apps/web/src/server/jobs/nightly.ts`, exposed at `POST /api/jobs/nightly` behind a `JOBS_SECRET` header, triggered by a GitHub Actions `schedule:` cron (free, no AWS setup). Locally, `pnpm jobs:nightly`. Replace the post-upload `sharp` Lambda with client-side resize + EXIF strip before the presigned PUT (`browser-image-compression` or a canvas). Zero Lambdas, zero EventBridge, zero IaC.

### 6.5 Better Auth plugins instead of custom tables
Better Auth ships a `username` plugin (unique, case-insensitive, reserved names) and an `admin` plugin (ban, sessions). Use `username` instead of hand-rolling `username`/`usernameLower` on `user_profile`; keep `user_profile` for bio/avatar/homeCity only.

### 6.6 Drop idempotency middleware from v1
`api.md` §10's `mutation_log` exists to make `trip.create`, `checkIn`, and `fork` retry-safe. `checkIn` is already idempotent (composite PK). Make `trip.create` and `fork` take a client-generated `id` and use `ON CONFLICT DO NOTHING`. No new table, no middleware.

### 6.7 Testing: three layers, in this order
1. **Unit** (Vitest): `tripPhase`, `orderKey` helpers, Yjs → row projection (pure function: `Y.Doc` in, rows out), the authz resolver with all six actors. Fast, no infra, written alongside the code.
2. **Integration** (Vitest + real Postgres via `docker compose`): tRPC procedures against the DB.
3. **E2E** (Playwright): one happy-path flow per phase, plus one two-browser-context collab test in Phase 3. The current `ci.yml` starts Postgres but not Hocuspocus; the collab test needs it.
Put the authz matrix in layer 2 from Phase 1 and never skip it; it is the test that protects real people.

### 6.8 Hosting for Stage 2 ("cloud, just me")
The PRD locks AWS (good, keep it). Within AWS, the docs jump straight to Amplify + Fargate + RDS + ALB + NAT, which is four consoles and ~$60–150/month once you leave free tiers, and Amplify's Next.js support historically lags Next releases. For Stage 2 the lowest-friction option is:

- **One Lightsail or EC2 `t4g.small` box** (~$12–15/mo) running the *same* `docker-compose.yml` as local (web, realtime, Postgres, plus Caddy for automatic TLS). Deploy = `git pull && docker compose up -d --build`, or push an image from CI. Nightly `pg_dump` to S3 is the backup. Real S3 and SES replace MinIO and Mailpit via env.
- Graduate to the documented Amplify + Fargate + RDS topology at Stage 3 or 4, when a second person's data makes managed Postgres worth its price. Nothing in the app changes; only env and the compose file.

If you would rather go managed from day one, SST (OpenNext on AWS, IaC in TypeScript, `sst dev` live-reload) is the modern replacement for raw CDK when the §7b gate for IaC arrives.

### 6.9 Small things that pay off immediately
- Pin every framework version in Phase 0 and record them in `CLAUDE.md`; the docs say "Next.js 15", "Tailwind v4", "Vercel AI SDK" without versions, and all three have had breaking majors since the docs were drafted.
- `drizzle-kit push` locally, generated migrations from Phase 1 onward, never both on the same DB.
- One `.env.example` with a comment per key saying where it comes from (already planned) plus a `pnpm doctor` script that checks Docker, ports, and keys.
- Structured logs (`pino`) and Sentry from Phase 0, as `ops.md` already says. This is the one piece of observability that costs nothing and saves hours.
- Feature flags as env booleans only. No flag service.

## 7. What I did not change

- Scope. The four AI features, social layer, and trip-mode all stay in v1 per your 2026-09-05 decision.
- The stack. AWS, Better Auth, Yjs + Hocuspocus, Drizzle, tRPC, Foursquare, Mapbox all stay. Hosting *within* AWS for Stage 2 is offered as an option in §6.8, not decided.
- Anything under `docs/`. The fixes in §3 are listed for you to apply so each doc stays consistent with the PRD; I only touched `PRD.md`, `CLAUDE.md`, and this file.

## 8. Changes applied to `PRD.md`

- §4.1: account-deletion rule for owned shared trips.
- §4.2: positional days with derived dates, drag-order-vs-time rule, undo/redo.
- §4.3: read-only viewer connections, immediate revocation, Yjs as the single content write path.
- §4.4: single owner + transfer, invite expiry/acceptance rules.
- §4.5: model pinned as config with retirement note, Foursquare caching constraint.
- §4.7: end-date requirement for location sharing, check-in latency, `trip.timezone`.
- §5: product analytics added as explicit v1 exclusion.
- §6: offline clarified (in-session tolerance yes, persisted offline no).
- §7b: new stage-gate table (local → cloud → trusted circle → public).
- §9: new open decisions (Sheets column audit, activity kinds/lodging/transport/budget, Foursquare caching, Stage 2 hosting) and new risks (model churn).
- §10: decision-log rows for this review.
- `CLAUDE.md`: Read-first pointer and AI model line updated.

## Sources

- Hocuspocus authentication and read-only connections: https://tiptap.dev/docs/hocuspocus/guides/authentication · https://github.com/ueberdosis/hocuspocus/discussions/302 · https://github.com/ueberdosis/hocuspocus/issues/566
- Gemini deprecations: https://ai.google.dev/gemini-api/docs/deprecations · https://pocketlantern.dev/briefs/gemini-2-0-and-2-5-model-shutdowns-and-replacements-2026 · https://freeainews.com/news/gemini-20-flash-shutdown-free-api-june-2026/
- Foursquare caching terms: https://foursquare.com/legal/terms/apilicenseagreement/ · https://openplacesapi.com/blog/can-you-store-places-api-results · https://foursquare.com/products/places-api/
