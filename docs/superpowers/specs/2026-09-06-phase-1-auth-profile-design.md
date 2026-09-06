# Phase 1 — Auth + Profile: Design Spec

> Approved 2026-09-06. Supersedes `docs/security.md` §2 where they conflict (see §6 Deviations). The implementation plan derived from this lives at `docs/superpowers/plans/` and must pass `docs/plan-review-rubric.md` before execution.

**PRD goal (§7, Phase 1):** "Sign up, log in, edit profile."

**Stage:** 1 — Local. Nothing is deployed. Where a control only becomes real at Stage 2+, this spec says so rather than implying coverage it does not have.

---

## 1. Scope

**In:** email + password signup with a username chosen at signup · login / logout · session-aware tRPC · password reset by email · email verification *sent* (not enforced locally) · profile editing (display name, bio, home city) · security controls in §5.

**Out, with the phase that owns it:** avatar upload (Phase 6 — nothing displays an avatar until Explore) · OAuth / Google / Apple (post-v1, needed for iOS) · trip-level roles (Phase 4) · 2FA, passkeys (v2 backlog) · account deletion / GDPR export (v2) · real alerting (Stage 2–3).

---

## 2. Decisions

Each is logged here and mirrored into `PRD.md` §10. Referenced elsewhere as **D1.x**.

| # | Decision | Why | Alternative rejected |
|---|---|---|---|
| **D1.1** | Username is chosen **at signup**, with live availability checking | User's explicit choice. People get the identity they want at the moment they care about it | Auto-generate from email and let them change it later — faster signup, no "taken" friction, but a rename migration later |
| **D1.2** | `username` + `usernameLower` live on Better Auth's **`user`** table via `additionalFields`, not on `user_profile` | Makes signup a **single atomic insert**; the unique index is the sole arbiter, so we can never create an account and *then* fail on a taken name. Verified supported in 1.7.1 by typechecking a real config | Username on `user_profile` (as `data-model.md` has it): two writes, and a race requires deleting the just-created account to compensate |
| **D1.3** | Display name uses Better Auth's built-in **`user.name`** | Avoids two competing name columns | `user_profile.displayName` per `data-model.md` — would leave `user.name` unused and ambiguous |
| **D1.4** | `user_profile` holds only bio, home city, `avatarKey` (null this phase). Created in `databaseHooks.user.create.after`, **created lazily if ever missing** | Nothing user-facing depends on it at signup, so a failure there can never block account creation | Requiring it at signup — reintroduces the atomicity problem D1.2 removes |
| **D1.5** | Verification emails are **sent** on signup but login is **not gated** on them locally (`REQUIRE_EMAIL_VERIFICATION=false`) | The e2e test asserts the email actually landed in Mailpit — proving the pipeline — without a human clicking an inbox on every test signup. Gate flips on at Stage 2 | Not sending at all (pipeline untested until Stage 2); or gating locally (tedious, and slows every test) |
| **D1.6** | Password reset ships in Phase 1 | Shares all the email plumbing with verification; splitting them means rebuilding the context later. Also: locking yourself out during Phase 2 is a real risk | Deferring to a later phase per strict PRD wording |
| **D1.7** | Pin `better-auth@1.7.1`, `nodemailer@9.0.5` | Version policy: newest release ≥2 weeks old with ≥1 patch on its major. `better-auth@1.7.3` shipped 2026-09-06; `nodemailer@10.0.0` on 2026-09-04 | Latest — would also trip pnpm's own `minimumReleaseAge` gate |
| **D1.8** | Rate limiting is **explicitly enabled**, not left to the default | Better Auth's default is `rateLimit?.enabled ?? isProduction` — **off in development**. Left alone, no local test could ever observe brute-force protection, and we would be shipping a control we have never run | Accepting the default |
| **D1.9** | Password reset and "forgot password" responses are **uniform** regardless of whether the email exists | D1.1 already gives attackers a username oracle by design; the reset flow must not add an email oracle on top | Distinct "no such account" message — friendlier, leaks membership |

---

## 3. Data model

```
user                 (Better Auth owns; we add two columns)
  id, name           <- name IS the display name (D1.3)
  email, emailVerified
  image              (unused this phase)
  username           <- additionalFields, input: true   (D1.2)
  usernameLower      <- additionalFields, input: false, unique index
  createdAt, updatedAt

session, account, verification   (Better Auth owns entirely)

user_profile         (ours)
  userId  PK -> user.id ON DELETE CASCADE
  bio, homeCity, avatarKey (null this phase)
  createdAt, updatedAt
```

`usernameLower` is derived server-side (`input: false` means a client cannot set it) and carries the unique index. Storing the lowercase form separately gives case-insensitive uniqueness without a `citext` extension, matching the approach already in `data-model.md` §2.1.

**Username rules** (own module, unit-tested): 3–32 chars, `[a-z0-9_]` after normalization, must start with a letter, no consecutive underscores, and a reserved-word denylist (`admin`, `api`, `settings`, `login`, `signup`, `explore`, `me`, …) so usernames can safely become profile URLs in Phase 6 without colliding with routes.

---

## 4. Architecture

| Piece | Path | Responsibility |
|---|---|---|
| Better Auth config | `apps/web/src/server/auth/index.ts` | Single source of auth behaviour |
| Auth route handler | `apps/web/src/app/api/auth/[...all]/route.ts` | Better Auth's own endpoints |
| Mailer | `apps/web/src/server/email/` | Nodemailer → Mailpit; verification + reset templates |
| Username rules | `packages/shared/src/username.ts` | Pure functions, no I/O — normalization, validation, denylist |
| tRPC context | `apps/web/src/server/trpc/init.ts` | Gains real `session`; `userId: null` placeholder from Phase 0 is removed |
| `protectedProcedure` | same | Rejects unauthenticated calls. The seam Phase 4's roles extend |
| Profile router | `apps/web/src/server/trpc/routers/profile.ts` | `get`, `update`, `checkUsernameAvailable` |
| Pages | `apps/web/src/app/(auth)/…`, `/profile` | signup, login, forgot-password, reset-password, profile |

**Username rules live in `packages/shared`** because Phase 6 (Explore) will validate the same strings server-side for profile URLs, and the browser needs identical rules for live feedback. One definition, two consumers — the same reason the Yjs document shape lives there.

**Boundary note.** `packages/shared/src/username.ts` is pure and browser-safe, so it is exported from the **barrel**, not a server-only subpath. It must not import `env` or `db`, and the Phase 0 Biome rule already enforces that.

---

## 5. OWASP Top 10:2025 — controls and how each is verified

Mapped against the **2025** list (released Nov 2025, final Jan 2026), not the 2021 list commonly cited. Notable: Injection moved to A05, Software Supply Chain Failures is new at A03, SSRF folded into A01, and A10 is new.

A control is only listed as covered if something **executes** to prove it. "Reviewed carefully" is not a control.

| # | Category | What we do in Phase 1 | How it's verified |
|---|---|---|---|
| **A01** | Broken Access Control | `protectedProcedure` on every non-public procedure. Profile mutations act **only** on `ctx.session.user.id`; no procedure accepts a caller-supplied user id (this is the IDOR/BOLA defence). Logged-out visitors to `/profile` are redirected | E2E: logged-out visitor redirected. **E2E: user A authenticated, attempts to mutate user B's profile → rejected.** Unit: no profile procedure takes a `userId` input |
| **A02** | Security Misconfiguration | Zod env contract fails loudly at boot (Phase 0). Cookies `httpOnly` + `SameSite=Lax` + `Secure` in production. `trustedOrigins` from env. Security headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`. **Boot guard: refuse to start in production if `REQUIRE_EMAIL_VERIFICATION=false` or rate limiting is disabled** | E2E asserts response headers and cookie flags. Unit test on the boot guard, same pattern as Phase 0's realtime stub guard |
| **A03** | Software Supply Chain Failures | Already the strongest area, from Phase 0: exact pins, committed lockfile, `--frozen-lockfile` in CI, pnpm `minimumReleaseAge`, `allowBuilds` allow-list for install scripts. **Add `pnpm audit` to CI** | CI step fails on a known advisory. D1.7 shows the policy actually being applied under pressure |
| **A04** | Cryptographic Failures | Passwords hashed with **scrypt** via `node:crypto` (verified in `better-auth@1.7.1`, *not* bcrypt as `docs/security.md` claims). Min length 10. Session token server-side; cookie carries an id only. Secrets from env, never bundled. Reset tokens single-use, 1h expiry | Unit: a password never appears in any log line. E2E: reset token rejected on second use. Phase 0's bundle grep already proves secrets don't reach the browser |
| **A05** | Injection | Drizzle parameterized queries only; the Phase 0 boundary rule keeps **all** SQL inside `packages/shared/src/db/`, so injection surface is auditable in one directory. Zod validates every tRPC input. React escapes by default; no `dangerouslySetInnerHTML`. **HTML emails escape all user-supplied values** — a real vector, since emails contain the username | E2E: signup with `<script>`/HTML in profile fields → stored and rendered inert. Test asserting the verification email body escapes a hostile display name |
| **A06** | Insecure Design | D1.1's live availability endpoint **is a username enumeration oracle by design** — accepted, but rate-limited and returning only a boolean. D1.9 keeps the reset flow from adding an email oracle. Failed-login throttling. Reserved-word denylist prevents usernames shadowing routes | E2E: repeated availability checks get throttled. E2E: reset response is byte-identical for a known and an unknown email |
| **A07** | Authentication Failures | Better Auth session management. Rate limiting explicitly on (**D1.8**). Sessions rotate on password change — "sign out everywhere". No credentials in URLs or logs | E2E: after a password reset, a session established beforehand is rejected. E2E: repeated bad logins throttle |
| **A08** | Software or Data Integrity Failures | Lockfile integrity via `--frozen-lockfile`. CI already asserts build artefacts (realtime bundle self-contained; no DB driver in the client bundle). Reset tokens are signed and verified by Better Auth; no unsigned deserialization anywhere | The two Phase 0 CI grep assertions, plus `--frozen-lockfile` |
| **A09** | Security Logging & Alerting Failures | Structured auth-event logging (pino): signup, login success **and failure**, password reset requested/completed, throttle triggered. User id only — never passwords, tokens, or full session ids | Unit: the auth logger redacts secret fields. **Honest limit:** log *aggregation and alerting* is Stage 2–3 per PRD §7b (Sentry at Stage 2, alarms at Stage 3). Phase 1 produces the signal; nothing watches it yet |
| **A10** | Mishandling of Exceptional Conditions | **Fail closed:** if session lookup throws, the request is treated as unauthenticated, never as authorized. tRPC error formatter strips internals in production — no stack traces to clients. Phase 0's lesson (a `down` branch that could never execute) is this category | E2E: a forced server error returns no stack trace or internal path. Unit: session-lookup failure yields unauthenticated, not authorized |

### What this does *not* cover

Being precise, because "no room for any OWASP vulnerability" is not a claim any design can honestly make:

- **No TLS in Phase 1.** Everything is `http://localhost`. `Secure` cookies and HSTS only become real at Stage 2 behind a real certificate. Until then, A02/A04 are partially theoretical.
- **Nothing watches the logs (A09).** Signal without alerting is not detection.
- **No dependency scanning beyond `pnpm audit`.** No SAST, no container scanning; those arrive with the Stage 3 hardening pass.
- **No penetration testing.** These controls are verified by our own tests, which encode our own assumptions. That is strictly weaker than an adversarial review.
- **Trip-level authorization is Phase 4.** A01 here covers only "a user can act on their own account". The `trip_member` join that protects trip data does not exist yet.
- **Rate limits are per-instance and in-memory.** They become bypassable the moment there is more than one instance (multi-instance is a v2 backlog item).
- **`x-forwarded-for` is trusted without validation.** Better Auth's `getIP` reads the header with no `trustedProxies` configured, so a client can choose its own rate-limit bucket. Harmless on localhost; a straightforward bypass the moment the app is reachable. **Stage 2 must set `advanced.ipAddress.trustedProxies`.** Note also that behind a multi-hop proxy the header carries several entries and Better Auth returns `null`, collapsing every user into one global bucket.
- **Signup still leaks membership.** A duplicate email returns `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`. D1.9 closes the oracle on the reset path, but signup reopens it. Accepted alongside the username oracle D1.1 already concedes; avoiding it costs real signup UX.

---

## 6. Deviations from `docs/`

Carried into the docs backlog rather than reverted, per the process rule that deviations have exactly one home.

| Deviation | Doc says | Why |
|---|---|---|
| Username on `user` via `additionalFields` | `data-model.md` §2.1 puts it on `user_profile` | D1.2 — atomic signup |
| Display name is `user.name` | `data-model.md` §2.1 has `user_profile.displayName` | D1.3 — avoids two name columns |
| **Passwords are scrypt, not bcrypt** | `security.md` §2.1: "bcrypt … cost factor 11 default — verify and bump to 12" | Verified in `better-auth@1.7.1`: `@better-auth/utils/password` → `node:crypto` scrypt. **`security.md` must be corrected**; the bcrypt tuning advice is unactionable |
| Rate limiting explicitly enabled | `security.md` §2 shows `rateLimit: { window: 60, max: 60 }` without noting the default | D1.8 — the default is off in development, which the doc's snippet obscures |
| `requireEmailVerification` false locally | `security.md` §2 sets it `true` | D1.5, and PRD §7b Stage 1 already says "email verification toggled off by env". The doc and PRD disagreed; PRD wins |
| No avatar upload | `data-model.md` has `avatarKey` | Column exists, stays null. Nothing renders an avatar until Phase 6 |

---

## 7. Definition of done (sketch — the plan expands each into a command)

- Signup with a username creates the account atomically; a duplicate username is rejected **without** creating an account.
- Verification email arrives in Mailpit and its body escapes hostile input.
- Login, logout, login again. Wrong password rejected and throttled.
- Full password reset through the real emailed link; the token fails on reuse; a pre-existing session is invalidated.
- Profile edits persist across reload. User A cannot mutate user B's profile.
- Logged-out visitor to `/profile` is redirected.
- Security headers and cookie flags present in the response.
- `pnpm lint && typecheck && test && build && CI=1 e2e` green; CI green including `pnpm audit`.
- `docs/build-log.md` and `docs/learnings.md` appended; `PRD.md` §10 carries D1.1–D1.9; `docs/security.md` scrypt correction applied.

---

## 8. Open question for the plan, not for this spec

Better Auth's Drizzle adapter needs its tables defined in our Drizzle schema. `better-auth@1.7.1` ships **no `bin`**, so schema generation comes from the separate `@better-auth/cli` package (currently 1.4.21 — a *lower* version line than the library). The plan's first task must establish whether that CLI generates a schema compatible with 1.7.1, or whether we hand-write the four tables from the documented shape. Hand-writing is the fallback and is not difficult; the point is to decide it with a probe, not an assumption.
