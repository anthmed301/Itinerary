# Tripi — Product Requirements Document

> **Audience:** internal only (solo build). This is the single product-level source of truth: why Tripi exists, who it's for, what v1 must do, and how we'll know it worked. Technical depth (schemas, APIs, infra) lives in `docs/` and should never contradict this file — if it does, this file wins and `docs/` gets updated.
>
> Supersedes `PLAN.md` (retired — see stub).

---

## 1. Overview

Trip planning today happens in Google Sheets: no structure, clunky sharing, no place data, no help drafting, and nothing useful once the trip actually starts. **Tripi is the trip-planning document — collaborative, AI-aware, and alive during the trip itself — that finally replaces the spreadsheet.**

It's a first-class, collaboratively-edited, AI-assisted trip document that quietly turns into a live travel companion the moment the trip starts, with a social layer so good trips are discoverable and reusable.

## 2. Target user & jobs-to-be-done

**Primary user (v1): you.** Secondary: friends/family you invite to co-plan or view a trip. Longer-term (see §8), general public via an iOS App Store release.

Jobs-to-be-done, drawn directly from what's frustrating about planning in Sheets today:

1. **Give the plan structure.** Sheets has no concept of a day, an activity, ordering, or an "ideas pool" for things you might do — you rebuild this scaffolding from scratch every trip.
2. **Make co-planning not clunky.** Sharing a sheet works, but there's no presence, no sense of who's editing what right now, no roles (owner/editor/viewer).
3. **Attach real place data.** No map, no address/hours lookup — that's all manual copy-paste today.
4. **Get help planning, and use it while traveling.** No AI assistance drafting or suggesting activities; the sheet is dead weight once the trip actually starts — no live/today view, no check-ins.
5. **Make it easy to format and share.** Sheets formatting is fiddly, and getting a plan in front of someone (in whatever medium is convenient — link, screenshot, social) is harder than it should be. Planning a trip from scratch and sharing it should be *convenient*.

## 3. Goals & success metrics

This is personal-use software, not a growth product — metrics are about whether it's actually good, not about acquisition.

| Goal | What "succeeded" looks like |
|---|---|
| **Real usage** | You plan and run an actual real trip in Tripi, start to finish, instead of Sheets. |
| **Real collaboration** | At least one real friend or family member — not a test account — plans or views a trip with you and the invite/collab flow holds up under real conditions. |
| **Fast & reliable** | Drag-and-drop and realtime sync feel instant with no lag or sync bugs; AI never silently inserts wrong information (all AI place suggestions round-trip through Foursquare verification per `docs/ai-integration.md`). |
| **Secure & cost-efficient** | The authz model in `docs/security.md` holds up in practice; spend tracks the cost ladder in `docs/ops.md` §7 with no surprise bills; no security incidents. |
| **Doesn't block the App Store goal** | You intend to eventually ship Tripi as an iOS app on the App Store (§8). v1's data model, auth, and API should stay reusable by a future native client — this is a *constraint* on how v1 is built, not a v1 deliverable. |

## 4. v1 scope — functional requirements

Organized by feature area. Each area maps to a phase in §7; exit criteria there are the acceptance detail for these requirements.

### 4.1 Auth & Profile
- Sign up / log in via email + password (Better Auth), with email verification.
- Users have a unique username, bio, and avatar (S3-backed upload).
- Password reset flow; "sign out everywhere."
- Account deletion is self-serve and cascades. If the user owns trips that have other members, the confirmation screen names those trips and offers ownership transfer first; otherwise those trips are deleted with the account. Comments, likes, and forks by a deleted user remain, attributed to "a deleted user."

### 4.2 Trip / Day / Activity Planning
- Create a trip; add days; add activities within a day, with drag-and-drop reordering (including cross-day moves).
- "Ideas pool" — activities not yet assigned to a day, draggable onto a day.
- Attach a real place (via Foursquare) to an activity; map renders pins for the active day (Mapbox).
- Days are positional ("Day 1 … Day N"); a day's calendar date is derived from `trip.startDate + index`, never stored per day. Trips work with no dates set, and changing the start date shifts every day.
- Activities may be timed or untimed. Display order is always the drag order (`orderKey`); times are informational. When drag order disagrees with times, the UI warns rather than auto-sorting.
- Undo/redo (Cmd+Z) for trip content, scoped to the current user's own edits (Yjs `UndoManager`).

### 4.3 Realtime Collaboration
- Two or more people editing the same trip see each other's changes live, including drag-and-drop, with presence (avatars/cursors).
- Self-hosted Yjs + Hocuspocus; per-trip document; auth-gated connections (only invited members).
- Viewer connections are opened read-only at the realtime server (Hocuspocus `connection.readOnly`), so a viewer's edits are rejected before they reach other clients or persistence. Removing or demoting a member closes their live connection immediately, not at token expiry.
- Yjs is the only write path for trip content (meta, days, activities) once a trip exists. Postgres rows for days/activities are a read projection written by the realtime persistence flush; tRPC never edits them directly. Membership, privacy, publish, social, check-ins, and location stay in tRPC.

### 4.4 Invites & Roles
- Owner can invite by username (in-app) or signed email link.
- Roles: Owner / Editor / Viewer, enforced at both the API layer and the realtime layer.
- Exactly one owner per trip. The owner can transfer ownership to another member, and cannot leave or be removed without transferring first.
- Email invites are single-use and expire after 7 days. If the email already belongs to a Tripi account, the invite also appears in-app. Accepting requires being signed in; the link is the capability, so any signed-in account may accept it. Re-inviting an existing member or a pending email returns the existing state rather than creating a duplicate.

### 4.5 AI Assistance
- **Suggester** — proposes activity cards for a day (draggable, not auto-inserted).
- **Co-planner** — chat-driven edits to the plan, expressed as proposed operations the user accepts.
- **Auto-planner** — generates a first-draft itinerary from a prompt.
- **Smart enrichment** — fills in photos/hours/address for a named place.
- All suggestions are proposals a human accepts, never silent writes; all place facts verified against Foursquare before landing in the document.
- Model: the current free-tier Gemini Flash-class model at the time Phase 5 starts. The original pick (Gemini 1.5 Flash) is retired and 2.5 Flash retires 2026-10-16, so the model id is a config value re-verified at Phase 5, never a hard-coded decision.
- Place data is cached from Foursquare only within its usage terms: the place id may be stored indefinitely; names, hours, and coordinates are refreshed within 24h (see §9).

### 4.6 Social
- Privacy: private (default) / unlisted-link / public-on-Explore.
- Likes and comments at the trip level (not per-day/activity — see §5).
- Follow other users; Explore feed of public trips.
- Fork a public trip with attribution to the original.

### 4.7 Trip-Mode
- When a trip's start date arrives, the view flips to a today-focused timeline with the current activity highlighted.
- Per-activity check-ins.
- Opt-in shared live location among collaborators on that trip only, off by default, revocable, hard-deleted on revoke and 24h after trip end. Requires `trip.endDate` to be set; an open-ended trip has no deletion deadline, so sharing is unavailable until one is.
- Check-ins propagate to other members within ~30s (polling), not through the realtime document. The "instant" promise in §3 applies to planning edits only.
- Trip-mode "today" is computed in the trip's own IANA timezone (`trip.timezone`, set from the destination at creation and editable), never inferred from activities.
- **No group chat in trip-mode for v1.**

## 5. Explicit out-of-scope for v1

These are deliberate exclusions, not oversights — moving any of them into v1 requires revisiting this PRD:

- Payments / Stripe (entitlement scaffolding exists in the data model so this needs no migration later)
- Per-day or per-activity comments (trip-level only)
- Group chat in trip-mode
- Advanced/paid AI tiers
- Custom domains
- Public "request to join" a trip
- Email digests, push notifications
- Offline write support
- Trip data export
- Admin dashboard
- Product analytics / event telemetry (error tracking only; analytics is a Stage 3 gate, see §7b)

## 6. Non-functional requirements

Full detail lives in `docs/security.md` and `docs/ops.md`; this is the PRD-level summary of what v1 is held to.

**Security & privacy**
- Three-layer authorization (tRPC middleware → Drizzle query joins through `trip_member` → Hocuspocus JWT gate); no procedure ships without an authz test matrix across owner/editor/viewer/stranger.
- Secrets never in client code or logs; rotated quarterly (immediately on suspected breach).
- GDPR/CCPA: comply (account deletion cascades, cookie consent, privacy policy). COPPA: block under-13 signups.
- Location data: never logged with lat/lng, hard-deleted per §4.7.

**Performance & reliability**
- Local dev: `pnpm dev` produces a working app within 60s of a fresh install.
- p95 request latency < 1s; 5xx rate < 1% (alarm thresholds from `docs/ops.md` §5.4).
- Zero data loss on realtime persistence (`realtime.persist_failures` alarms on any failure). Accepted bound: a server crash can lose at most the edits since the last flush (≤5s cadence, plus flush on disconnect).
- Offline: in-session disconnect tolerance is required (Yjs buffers edits while the tab stays open and syncs on reconnect). Persisted offline mode (service worker, IndexedDB) is not v1 (§5).

**Cost**
- Track the cost ladder in `docs/ops.md` §7 (POC ≈ $0 → soft launch ≈ $30/mo). Formal cost alarms are deferred (see below); check spend by hand for v1.

**Operating philosophy for v1: lean now, harden iteratively**
- Stay on AWS (Amplify + ECS Fargate + RDS + S3 — matches existing access, all free-tier-eligible for solo/POC scale), but skip the ceremony that assumes a launched, multi-user product: no CDK/infrastructure-as-code, no OpenTelemetry/CloudWatch dashboards/PagerDuty, a single CI workflow instead of three, and no formal backup runbooks (RDS's default automated snapshot is the backup for now).
- Add each piece back — in this order, roughly — as it's actually forced: real alarms and a dashboard before inviting people beyond a small trusted circle; CDK once the manual AWS setup has been rebuilt more than twice; formal runbooks the first time an incident actually happens; on-call rotation only before a public launch. Full detail (including what each deferred piece looks like when built) lives in `docs/ops.md`.

## 7. Phased rollout

Same 9 phases as before; each phase's exit criteria (in `docs/` and the original phase breakdown) is the source of acceptance detail. **Solo-pace note:** phases complete when their exit criteria are met, not on a calendar — there is no fixed deadline, so phase order (not phase duration) is the planning tool.

| Phase | Goal |
|---|---|
| 0 — Foundation | Monorepo, Docker, CI, vertical slice green from a **production build** (browser → tRPC → Postgres, and two-tab Yjs sync) — AWS deploy moved to Stage 2, see §10 (2026-09-05) — **done 2026-09-05** |
| 1 — Auth + Profile | Sign up, log in, edit profile |
| 2 — Trips/Days/Activities/Ideas | Full CRUD + drag-and-drop + ideas pool + place attachment |
| 3 — Realtime Collab | Multi-user live editing via Yjs + Hocuspocus |
| 4 — Invites + Roles | Owner/editor/viewer enforced end-to-end |
| 5 — AI Integration | All four AI features working and feeling magical |
| 6 — Social | Explore, likes, comments, follows, fork |
| 7 — Trip-Mode | Live timeline, check-ins, opt-in location |
| 8 — Polish + Pre-launch | Perf, accessibility, brand, marketing stub |
| 9 — Soft launch | Real invited users, monitor, fix |

### 7b. Stage gates — from laptop to public

Phases above are *features*; stages are *where it runs and who can reach it*. They are independent axes: you can be at Phase 5 and still Stage 1. Each row lists what must be true before entering the stage and what changes when you do. Nothing else changes; the same codebase and the same `docker-compose.yml` carry Stages 1–3.

| Stage | Who | Where it runs | Gate to enter | What changes on entry |
|---|---|---|---|---|
| **1 — Local** | You, one machine | `docker compose` (Postgres, MinIO, Mailpit) + `pnpm dev` | — | Email goes to Mailpit; email verification toggled off by env; personal free-tier AI/Foursquare/Mapbox keys |
| **2 — Cloud, still just you** | You, from any device | Cheapest AWS thing that runs the *same* compose file 24/7 (single Lightsail/EC2 box + Caddy), or the documented Amplify + Fargate + RDS topology — open decision, §9 | Phase 2 done; nightly `pg_dump` → S3 working and restored once | Real domain + TLS; real S3; SES sandbox (verified recipients only); secrets out of `.env`; Sentry on |
| **3 — Trusted circle** | Invited friends/family | Same as Stage 2, graduating to managed Postgres if the box hurts | Phases 3–4 done; authz test matrix green incl. anonymous + link-holder actors; SES production access granted; one restore drill done | Real alarms (5xx, realtime persist failures, daily cost); minimal product analytics; privacy policy + terms live |
| **4 — Public** | Anyone via Explore, later App Store | AWS-native: Amplify + ≥2 realtime tasks + Redis + RDS Multi-AZ | Phases 6–8 done; report flow + moderation live; rate limits verified under load; IaC written (setup rebuilt ≥2×); domain chosen | Multi-instance realtime; on-call rotation; OAuth for iOS; Foursquare/Mapbox paid tiers budgeted |

## 8. Future features / backlog (v2+)

Things we *want*, deliberately not now. Unlike §5 (hard exclusions with a stated reason), this list is meant to grow as ideas come up.

- **iOS app on the App Store** — explicit goal, not just "eventually." This is why §3 calls out v1 not blocking a future native client (shared auth/API surface). Needs OAuth (Google/Apple sign-in) as a likely prerequisite for a good mobile onboarding flow.
- Monetization / Stripe freemium tier (data model already has entitlement scaffolding)
- Per-day / per-activity comments
- Group chat in trip-mode
- Advanced/paid AI tiers
- Custom domains
- Public "request to join" a trip
- Email digests, push notifications
- Offline write support
- Trip data export
- Admin dashboard
- Photo-book-style post-trip recap (Polarsteps-inspired upsell idea)
- ICS / email booking-confirmation parsing (TripIt-inspired)
- Google Places as a paid swap-in if Foursquare data proves too sparse outside US/EU
- 2FA, passkeys, WebAuthn (Better Auth supports all three; enable when iOS lands or before public launch)
- Full GDPR data-export tooling
- Multi-instance realtime (Redis-backed) / read replicas / multi-region — only when usage actually demands it

## 9. Risks & open decisions

| Item | Status |
|---|---|
| **Column audit of the current Sheets** | **Open — do before Phase 2.** List every column and tab your real trip sheets use (cost, booking link, confirmation #, status, lodging, transport, notes…). Anything you use today that has no home in §4 is either a v1 requirement or an explicit §5 exclusion. This is the biggest unknown in the PRD. |
| Activity kinds (activity / food / lodging / transport), per-activity cost, booking links | Open — depends on the column audit. Cheap to add to the schema now, expensive later; multi-city trips need lodging-per-night and transfers to be first-class, not free text. |
| Foursquare caching terms | Open — verify before Phase 2. Per their usage guidelines only the place id is cacheable indefinitely; other fields ≤24h. v1 plan: `place` is a 24h cache with refresh-on-read. Escape hatches: open datasets (FSQ OS Places, Overture) or Google Places. |
| Stage 2 hosting | Open — pick at end of Phase 2. Single AWS box running the local compose file (cheapest, same file as dev) vs. Amplify + Fargate + RDS from day one (more consoles, what `docs/ops.md` describes). App code is identical either way. |
| AI model churn | Google retires Flash models roughly yearly; the model id is config, re-verified at Phase 5 and on each retirement notice. Vercel AI SDK majors also break the tool API; pin versions in Phase 0. |
| Free-tier limits hit unexpectedly during testing | Mitigate with cost dashboards (Phase 0) and per-user AI quotas (Phase 5) |
| Hocuspocus single-instance is a SPOF | Acceptable for v1; multi-instance Redis-backed broadcast is a backlog item (§8) before any public launch |
| Foursquare data sparse outside US/EU | Tavily web search fallback; Google Places swap-in is a backlog escape hatch |
| AI generates plausible-but-wrong info | All AI place suggestions must round-trip through Foursquare before being added — non-negotiable (§4.5) |
| Spam/abuse on public Explore | `report_trip` flow + rate limits on publish (Phase 6) |
| Yjs document grows unbounded | Nightly snapshot + GC pass; cap doc size at 1MB with a warning |
| **Competitive-analysis data is stale** | `docs/competitive-analysis.md` was written without live web search and is explicitly flagged `⚠️verify` throughout (pricing, competitor feature claims) — now ~4.5 months old. Re-verify before leaning on it for any positioning decision. |
| **Solo timeline is unbounded** | Full 9-phase v1 scope was kept deliberately despite the move to solo (see decision log). No deadline is set; risk is losing momentum on a long roadmap with no external accountability. Revisit scope if Phase 3 (Realtime Collab) or Phase 5 (AI) stall for an extended period. |
| Brand direction (3 options in `docs/design-system.md` §1) | Undecided — pick before Phase 8 |
| AWS hosting form (Amplify vs ECS for `apps/web`) | **Decided 2026-09-05:** stay on AWS, deploy manually for v1 (see §6 operating philosophy and `docs/ops.md`) |
| DB at launch (RDS vs Aurora Serverless v2) | Undecided — pick before Phase 9 |
| Domain | Skipped during POC; pick before public launch |

## 10. Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-04-26 | Web-only v1 (iOS deferred) | Smaller surface area; ship faster; learn before going native |
| 2026-04-26 | Better Auth email+password only | Avoid OAuth setup during POC; add Google/Apple for iOS launch |
| 2026-04-26 | Self-hosted Yjs+Hocuspocus on AWS | No vendor cap; own the data; unified AWS infra |
| 2026-04-26 | Drop Twitter API | $100/mo minimum; OS share-sheet is free |
| 2026-04-26 | Local Docker Postgres for POC | User wants local control; managed DB only at launch |
| 2026-04-26 | All 4 AI features in v1 | Differentiator vs Wanderlog/TripIt |
| 2026-04-26 | Trip-mode: check-ins + opt-in location, no chat | Reduces moderation surface; chat moves to v2 if proven needed |
| 2026-04-26 | Foursquare over Google Places | Free tier viable; swap to Google later if data quality demands it |
| 2026-04-26 | Mapbox over Google Maps | Cheaper at scale; quality is fine for this use case |
| 2026-04-26 | Gemini 1.5 Flash for AI POC | Only free tier among reasoning-quality models |
| 2026-09-05 | Build is now solo (was 2-person) | Team changed; documented so future-you knows why pace assumptions shifted |
| 2026-09-05 | Keep full v1 scope despite solo build | Explicit choice to accept a longer timeline over cutting scope |
| 2026-09-05 | PRD.md created as single product source of truth; PLAN.md retired | Wanted PRD-shaped document (problem/users/requirements/success metrics) distinct from the technical spec bundle in `docs/`; spec-driven flow is now PRD → `docs/` specs → phase implementation plans |
| 2026-09-05 | v1 defers CDK/IaC, OTel+CloudWatch+PagerDuty, multi-workflow CI, and formal backup runbooks; stays on AWS otherwise | Don't over-design a solo first iteration; want the best stack with free/cheap tiers now and room to harden iteratively as real usage demands it, not upfront. Updated `docs/ops.md` accordingly. |
| 2026-09-05 | Yjs is the single write path for trip content; tRPC never mutates day/activity rows | PRD review found a split-brain: tRPC row edits are overwritten by the next realtime flush. One write path removes the bug and about a third of the API surface. See `docs/prd-review-2026-09-05.md` §2.2. |
| 2026-09-05 | Viewer role enforced via Hocuspocus read-only connections, not by skipping persistence | Skipping the flush for viewers doesn't work: their update is already in the in-memory doc and is persisted by the next editor's flush. Review §2.1. |
| 2026-09-05 | Days are positional with dates derived from `trip.startDate` | Supports undated trips and shifting a whole trip; removes the dual `date`/`orderKey` ordering model. Review §3 #7. |
| 2026-09-05 | Single owner per trip + ownership transfer | API and data model disagreed on multi-owner; single owner is what `trip.ownerId` already models. |
| 2026-09-05 | AI model id is config, not a decision; Foursquare cache limited to 24h | Gemini 1.5 Flash is retired; Foursquare terms forbid indefinite caching of place facts. Review §2.3–2.4. |
| 2026-09-05 | Added §7b stage gates | Wanted explicit, checklist-style triggers for local → cloud → trusted users → public, separate from the feature phases. |
| 2026-09-05 | Phase 0 no longer includes an AWS deploy; cloud entry is Stage 2 per §7b | Avoids building deploy plumbing before there is anything to deploy. Phase 0 instead proves the production path locally: `pnpm build` and every service's `start` script run in CI from this phase onward, and the e2e suite runs against the built artefacts rather than dev servers. |
| 2026-09-05 | Local Postgres is on host port **5433**, not 5432 | A Homebrew `postgresql@17` service (database `album_app`) owns 5432 on the dev machine and auto-starts at login. Remapping leaves that project working and cannot re-collide; stopping it would break an unrelated app every reboot. CI uses 5433 too, so `DATABASE_URL` is byte-identical in both environments. |
