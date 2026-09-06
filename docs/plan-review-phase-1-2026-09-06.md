# Phase 1 Plan Review — 2026-09-06

> Review of `docs/superpowers/plans/2026-09-06-phase-1-auth-profile.md` against `docs/plan-review-rubric.md`, with `docs/superpowers/specs/2026-09-06-phase-1-auth-profile-design.md` as the approved design and `PRD.md` §7/§7b/§9/§10 as the product contract. Findings are ranked by cost if discovered during the build.
>
> Every claim marked **verified** was produced by running a command on 2026-09-06 on Node 24.20.0, against `better-auth@1.7.1` / `nodemailer@9.0.5` / `next@16.3.4` / `@trpc/server@11.18.0` / `turbo@2.10.12` / `playwright@1.62.1` installed into a scratch directory, and against the running Docker Postgres on 5433. The probes are in §6 so they can be rerun.
>
> **Per L2, every fix prescribed here was itself probed before it was written down.** Where a patch has a part I could not execute in isolation, §3 says so explicitly rather than dressing it up as verified.

---

## 1. Verdict

The plan's *design* is the best this project has produced. The security work is genuinely first-rate: a control matrix mapped to the correct (2025) OWASP list, an honest "what this does not cover" section, D1.8 catching a security default whose value is wrong rather than absent, and D1.9 refusing to add an email oracle on top of a username oracle it already accepted by design. The version selection is exact and re-resolves against the registry today. `@better-auth/cli` was correctly rejected on evidence. The boundary work from Phase 0 is respected without being restated.

It has **four blocking defects**, and they are the same species as Phase 0's: the plan probed the things it could probe *statically* — type shapes, registry dates, `dist/` greps — and asserted the things that only appear when code *executes*. Three of the four are invisible to a typecheck and to a `getAuthTables()` dump, and all four fail on the first real run.

1. **Every signup returns HTTP 400.** `usernameLower: { required: true, input: false }` is rejected by Better Auth's own body validation *before* `databaseHooks.user.create.before` ever runs. Verified: `{"message":"usernameLower is required","code":"MISSING_FIELD"}`. D1.2's atomic signup never happens. §3.1
2. **`pnpm build` fails, and `CI=1 pnpm e2e` cannot pass.** The A02 boot guard runs at module scope in a file the route handler imports; `next build` evaluates that module with `NODE_ENV=production`, and `next start` — what `CI=1` serves — runs with `NODE_ENV=production` too. The plan's own `.env.local` sets `REQUIRE_EMAIL_VERIFICATION=false`. The guard is therefore in direct collision with D1.5 and with `CLAUDE.md`'s production-parity rule. Verified by running `next build` with the guard's exact shape. §3.2
3. **The new environment variables reach neither `next build` nor CI.** Turbo 2.10.12 runs in `envMode: strict` (verified: an undeclared variable arrives as `undefined` in the task process), and Task 1 explicitly instructs leaving them out of `build`'s `env` array. `.github/workflows/ci.yml` gains no `BETTER_AUTH_SECRET`, no `EMAIL_FROM`, and no Mailpit service — so half the e2e suite can never be green in CI. §3.3
4. **The e2e suite throttles itself.** Better Auth ships *default special rate-limit rules* that override the configured `max: 30`: `/sign-in*` and `/sign-up*` are **3 requests per 10 seconds**, `/request-password-reset` is **3 per 60 seconds**. Verified: `sign-up statuses: 200,200,200,429,429,429`. The plan's suite performs eleven signups and three reset requests from a single rate-limit bucket. §3.4

Two of the user's specific worries turned out to be unfounded, and I say so with evidence rather than leaving them open: the CSP is clean under both Next 16 dev (Turbopack) and `next start`, with `ws://localhost:1234` connecting and hydration intact (§6.7); and the Playwright `request` fixture has an isolated cookie jar but does inherit `baseURL`, which is exactly what the plan's four `request` tests need (§6.8).

Fix §3, apply §4, and this plan is executable. Nothing in the patches changes the architecture or the task order.

---

## 2. Rubric scores

| # | Dimension | Score | Evidence |
|---|---|---|---|
| 1 | Goal fidelity | 4 | Goal matches `PRD.md` §7 Phase 1 and D1.6 logs the password-reset widening. But §4.1's self-serve account deletion is pushed to v2 by spec §1 with no §10 row (M13), and D1.4/D1.7/D1.9 never reached §10 despite Task 14 Step 3 asserting they did. §4.8 |
| 2 | Claim verification | 3 | A 12-row Verified-facts table and five rerunnable probes — most of them correct, and P2/P4/P5 reproduce exactly. But the two highest-stakes behaviours were never *executed*: the before-hook contract (§3.1) and which rate-limit rules are actually in force (§3.4). Both are wrong. The `inferAdditionalFields` runtime claim is also false (§4.7) |
| 3 | Executability | **1** | Task 5 Step 9's `curl` never gets there: `pnpm build` fails first (§3.2). Once past that, every signup 400s (§3.1). Two steps fail as written before any test runs |
| 4 | Production parity | **1** | The plan's own A02 guard makes `next start` refuse to serve auth in precisely the configuration the DoD requires, and `next build` throws during page-data collection. CI additionally lacks the env vars and the mail service. §3.2, §3.3 |
| 5 | Boundary enforcement | 5 | SQL stays in `packages/shared/src/db/client.ts` (Task 7 Step 1), `username.ts` is pure and goes on the browser-safe barrel with the reason stated, the Phase 0 Biome rule is left untouched, and the DoD keeps both bundle greps. Verified: `import type { auth }` is erased, so `typeof auth` cannot pull the driver into a chunk |
| 6 | Test determinism | **2** | The suite throttles itself from a single IP bucket (§3.4); the cookie test breaks under `CI=1` because the cookie is renamed `__Secure-…` (§4.1); the A10 test breaks under `pnpm dev` because tRPC attaches `data.stack` when `isDev` (§4.2). Three of fourteen new tests fail in one mode or the other |
| 7 | Config contract | **2** | One Zod source of truth, correctly extended, with a genuinely good `envBool` helper (`z.coerce.boolean()` really does treat `"false"` as truthy). But Task 1 Step 7 instructs leaving the new vars out of `build`'s Turbo `env` array, and CI is never given them. §3.3 |
| 8 | Dependency risk | 5 | All three additions re-resolved against the registry today with dates: `better-auth@1.7.1` 2026-08-18 (19 d), `1.7.2` 2026-08-26 (11 d), `1.7.3` today; `nodemailer@9.0.5` 2026-08-07 (30 d), `9.0.6` 11 d, `10.0.0` 2 d. `@types/nodemailer@8.0.1` is latest. `@better-auth/cli` newest publish is 2026-03-16, correctly rejected. §6.1 |
| 9 | Consistency with docs | 4 | Nine-row deviations table; `docs/security.md` §2.1 already carries the scrypt correction. Missing: the three PRD §10 rows (§4.8) and the account-deletion deferral |
| 10 | Process hygiene | 4 | One commit per task; Tasks 6+7 merged with the compile-order reason stated; the audit gate lands before the DoD needs it. Deduction: the CI env and Mailpit-service changes §3.3 requires belong to a task and belong to no task |
| 11 | Security posture | **2** | The guard is well-designed and cannot run in the environment it targets (§3.2). Spec §5 A06 claims the availability oracle is "rate-limited"; it is a tRPC procedure at `/api/trpc/*`, which Better Auth's limiter never sees — the control does not exist (§4.3). A09's logger is defined, unit-tested, and then called exactly once, mislabelled (§4.4) |
| 12 | Scope discipline | 4 | Tight; `zxcvbn` correctly refused with the reason. `/verify-email` is unreachable dead code — signup builds the link with `callbackURL=%2F` and nothing passes another (§4.6). Six of the seven `AuthEvent` values are never emitted |
| 13 | Definition of done | 3 | Every line is a command, split dev/security/gates/records — the right shape. But three lines cannot pass as written (`pnpm build`, `CI=1 pnpm e2e`, cookie flags), the web unit-test counts are wrong (M2), and `pnpm audit`'s stated expected output does not match this repo (M3) |

Rows 3 and 4 are at **1** and block execution. Rows 6, 7 and 11 are at **2** and need a named owner and a deviations-table line if they are accepted rather than fixed.

---

## 3. Blocking findings

### 3.1 Every signup returns 400: `input: false` and `required: true` are mutually exclusive

**Verified by running a real signup** through `auth.api.signUpEmail` against the plan's exact config, schema, and hooks (probe P1). Result:

```
STATUS 400
BODY {"message":"usernameLower is required","code":"MISSING_FIELD"}
```

The `before` hook never logged. Better Auth validates `additionalFields` against the **request body** in `sign-up.mjs` (line 150 destructures `...rest` and checks it) *before* `databaseHooks.user.create.before` runs. A field that is `required: true` must therefore arrive from the client — and `input: false` is precisely the declaration that it never will. The two flags cancel each other out.

This is load-bearing exactly as the review request suspected: D1.2's "single atomic insert" produces zero inserts, and the `NOT NULL username_lower` column is never reached because the request dies in validation.

**Patch — verified end to end.** In Task 5 Step 6, change one word:

```ts
  user: {
    additionalFields: {
      username: { type: 'string', required: true, input: true },
      // required:false, not true. Better Auth validates additionalFields against
      // the request BODY before databaseHooks run, so a `required` field that a
      // client is forbidden to send (input:false) is rejected as MISSING_FIELD.
      // NOT NULL on user.username_lower is still the real guarantee.
      usernameLower: { type: 'string', required: false, input: false, unique: true },
    },
  },
```

With that single change, and the plan's `before`/`after` hooks otherwise verbatim, the same probe gives (P1b):

```
BEFORE HOOK input: {"createdAt":…,"email":…,"name":"Alice Example","username":"Alice_01","emailVerified":false}
AFTER HOOK created: {…,"username":"Alice_01","usernameLower":"alice_01","id":"CQZxyb…"}
STATUS 200
USER ROWS:    [{ …, "username":"Alice_01", "usernameLower":"alice_01" }]
PROFILE ROWS: [{ "userId":"CQZxyb…", "bio":null, "homeCity":null, "avatarKey":null }]
```

So three of the plan's other claims are confirmed at the same time, and should be recorded as verified rather than assumed:

- the `before`-hook return shape `{ data: {...} }` **is** accepted and its values reach the INSERT;
- a field declared `input: false` **does** survive being set by a before-hook;
- the `after` hook runs with the created row including `id`, and the `user_profile` insert lands.

Duplicate-username behaviour was probed too, because D1.2 rests on it (P1c). A second signup with `ALICE_01` gives `422 {"code":"FAILED_TO_CREATE_USER"}`, the Postgres error is `duplicate key value violates unique constraint "user_username_lower_idx"`, and the `user` row count stays at 1 — **no orphan account**. D1.2 holds once §3.1 is fixed. Note the UX consequence in M4: the specific reason is swallowed.

### 3.2 The A02 boot guard makes `pnpm build` fail and `CI=1 pnpm e2e` impossible

`assertProductionAuthPosture` is called at **module scope** in `apps/web/src/server/auth/index.ts`, which `app/api/auth/[...all]/route.ts` imports, which `server/trpc/init.ts` also imports (Task 6), which `server/trpc/root.ts` re-exports into the home page.

**Verified** by building a minimal Next 16.3.4 app with a route handler carrying the guard's exact shape (probe P2):

```
MODULE EVAL: NODE_ENV= production NEXT_PHASE= phase-production-build
Error: Failed to collect configuration for /api/auth/[...all]
  [cause]: Error: GUARD FIRED: Unsafe auth configuration for production
> Build error occurred
Error: Failed to collect page data for /api/auth/[...all]
```

And under `next start` (probe P2b):

```
MODULE EVAL: NODE_ENV= production NEXT_PHASE= <undef>
HANDLER RUN:  NODE_ENV= production NEXT_PHASE= <undef>
```

So both halves fail:

- **`pnpm build`** throws during "Collecting page data", locally and in CI, with `REQUIRE_EMAIL_VERIFICATION=false` — which is what Task 1 Step 6 writes into `.env.local` and what D1.5 requires.
- **`CI=1 pnpm e2e`** serves `turbo run start` → `next start` → `NODE_ENV=production`. The module is evaluated on the first request to any auth route and throws. Every authenticated test in the suite dies.

This is not a bug in the guard's code; it is a category error in what it keys on. `NODE_ENV=production` means "this is a built artefact", not "this is deployed where strangers can reach it". `PRD.md` §7b already has the right axis and calls it a *Stage*: Stage 1 is local and explicitly says "email verification toggled off by env". The guard should fire on Stage, not on `NODE_ENV`.

**Patch.** Three parts. Parts 1 and 3 are mechanical applications of patterns already verified in this repo; part 2 is the probed value.

1. Add a stage variable to `coreShape` in `packages/shared/src/env.ts`, using the same `z.enum(...).default(...)` form the existing `NODE_ENV` line already uses:

```ts
const coreShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // PRD §7b stages. NODE_ENV says "this is a built artefact"; APP_STAGE says
  // "strangers can reach this". The A02 posture guard keys on the second.
  APP_STAGE: z.enum(['local', 'cloud', 'trusted', 'public']).default('local'),
  DATABASE_URL: z.string().startsWith('postgres'),
}
```

Add `APP_STAGE=local` to `.env.example` and `.env.local`, and to every Turbo `env` array and the CI `env:` block alongside the vars in §3.3.

2. Rewrite `guard.ts` to take the stage, and to no-op during the build. `phase-production-build` is the **verified** value of `process.env.NEXT_PHASE` under `next build`, and it is `undefined` under `next start` (P2/P2b), so this cleanly separates the two:

```ts
export type AuthPosture = {
  APP_STAGE: 'local' | 'cloud' | 'trusted' | 'public'
  REQUIRE_EMAIL_VERIFICATION: boolean
  RATE_LIMIT_ENABLED: boolean
}

/**
 * A02. Two settings are relaxed for Stage 1 (D1.5, D1.8). This makes it
 * impossible for either to reach a deployed stage unnoticed.
 *
 * Keyed on APP_STAGE, not NODE_ENV: `next build` and `next start` both run with
 * NODE_ENV=production on the laptop, and CLAUDE.md requires both to run there.
 */
export function assertProductionAuthPosture(env: AuthPosture): void {
  if (env.APP_STAGE === 'local') return

  const failures: string[] = []
  if (!env.REQUIRE_EMAIL_VERIFICATION) failures.push('REQUIRE_EMAIL_VERIFICATION must be true')
  if (!env.RATE_LIMIT_ENABLED) failures.push('RATE_LIMIT_ENABLED must be true')
  if (failures.length > 0) {
    throw new Error(`Unsafe auth configuration for APP_STAGE=${env.APP_STAGE}:\n  ${failures.join('\n  ')}`)
  }
}
```

3. In `apps/web/src/server/auth/index.ts`, skip it during the build so a build never needs deployment secrets:

```ts
// `next build` evaluates every route module to collect page data. Verified:
// NEXT_PHASE === 'phase-production-build' there, and undefined under `next start`.
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  assertProductionAuthPosture({
    APP_STAGE: env.APP_STAGE,
    REQUIRE_EMAIL_VERIFICATION: env.REQUIRE_EMAIL_VERIFICATION,
    RATE_LIMIT_ENABLED: env.RATE_LIMIT_ENABLED,
  })
}
```

Update `guard.test.ts` to drive `APP_STAGE` (`'local'` passes with both flags off; `'cloud'`, `'trusted'` and `'public'` each throw naming the offending variable). Add a DoD line: `APP_STAGE=cloud REQUIRE_EMAIL_VERIFICATION=false pnpm --filter @tether/web start` refuses to serve `/api/auth/ok`.

> The alternative — leaving the guard on `NODE_ENV` and setting `REQUIRE_EMAIL_VERIFICATION=true` for the CI e2e run — is not available: it would gate login on a click in Mailpit for every one of the eleven signups in the suite, which is the exact cost D1.5 exists to avoid.

### 3.3 The new env vars reach neither `next build` nor CI, and CI has no Mailpit

Three independent gaps, all in the same blast radius.

**(a) Turbo strict mode.** `pnpm exec turbo run build --dry=json` reports `envMode: strict`, and `@tether/web#build` lists only `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_HOCUSPOCUS_URL`. Verified empirically in a scratch workspace on the same `turbo@2.10.12` (probe P3): a declared variable arrives, an undeclared one arrives as `<undef>`. Task 1 Step 7 explicitly instructs *not* to add the new variables to `build`. But Task 5 puts `const env = webEnv()` at module scope, and §3.2 proves `next build` evaluates that module — so `webEnv()` runs during the build with `BETTER_AUTH_SECRET`, `EMAIL_FROM` and `DATABASE_URL` all stripped, and throws `Invalid web environment`. This is L3 reproduced exactly.

**(b) CI has no secret.** `.github/workflows/ci.yml`'s `env:` block sets five variables; `BETTER_AUTH_SECRET` (`min(32)`, no default) and `EMAIL_FROM` (`min(3)`, no default) are not among them. The Build step fails.

**(c) CI has no SMTP and no Mailpit HTTP API.** `docker-compose.yml` runs `axllent/mailpit:v1.31` locally, but the CI job only declares a `postgres` service. `sendEmail` will fail to connect to `localhost:1025`, `emailVerification.sendOnSignUp` will throw inside the signup request, and every `waitForEmail()` against `localhost:8025` will time out. Six of the fourteen new e2e tests can never be green in CI, and the DoD's "CI green on the PR" is unreachable. Task 13 is the only task that touches `ci.yml`, and it only adds the audit step.

**Patch.**

1. Task 1 Step 7: add all six variables to the `dev`, `start` **and `build`** `env` arrays in `turbo.json`, plus `DATABASE_URL` to `build`:

```json
"build": {
  "dependsOn": ["^build"],
  "outputs": [".next/**", "!.next/cache/**", "dist/**"],
  "env": [
    "DATABASE_URL",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_HOCUSPOCUS_URL",
    "APP_STAGE",
    "BETTER_AUTH_SECRET",
    "SMTP_HOST",
    "SMTP_PORT",
    "EMAIL_FROM",
    "REQUIRE_EMAIL_VERIFICATION",
    "RATE_LIMIT_ENABLED"
  ]
}
```

2. Move the CI changes out of Task 13 into a task of their own (or fold them into Task 1, which is where the contract is defined). Add to `ci.yml`'s `env:` block:

```yaml
      APP_STAGE: local
      BETTER_AUTH_SECRET: ci-better-auth-secret-at-least-thirty-two-chars
      EMAIL_FROM: Tether <no-reply@tether.local>
      REQUIRE_EMAIL_VERIFICATION: 'false'
      RATE_LIMIT_ENABLED: 'true'
```

3. Add Mailpit as a CI service, pinned to the same tag `docker-compose.yml` uses:

```yaml
      mailpit:
        image: axllent/mailpit:v1.31
        ports: ['1025:1025', '8025:8025']
        options: >-
          --health-cmd "/mailpit readyz"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
```

4. Add to `scripts/preflight.mjs` a check that `.env.local` contains a non-placeholder `BETTER_AUTH_SECRET` of at least 32 characters. `preflight` already checks `mailpit :8025`, so that half is covered.

**Verified for the runtime half:** `nodemailer@9.0.5` needs no `serverExternalPackages` entry — it builds and runs unchanged under `next build` + `next start` on Next 16.3.4, and the message reaches Mailpit with the long reset URL intact and un-line-wrapped (probe P4). The Mailpit API shape the helper assumes (`messages[].{ID,To[].Address,Subject}`, then `/api/v1/message/{id}` → `{Subject,HTML,Text}`) is confirmed against the running container.

### 3.4 Better Auth's default rate-limit rules throttle the e2e suite itself

The plan configures `rateLimit: { enabled, window: 60, max: 30 }` and then reasons from it: *"The throttle test asserts a 429 appears within 40 attempts against a `max: 30` window, so it is not brittle against the exact limit."*

That model of the system is wrong. `better-auth/dist/api/rate-limiter/index.mjs` `getDefaultSpecialRules()` returns two rules that **override** the configured base for the paths that matter:

| Path prefix | window | max |
|---|---|---|
| `/sign-in`, `/sign-up`, `/change-password`, `/change-email` | 10 s | **3** |
| `/request-password-reset`, `/send-verification-email`, `/forget-password` | 60 s | **3** |

Verified by driving `auth.handler` with real `Request` objects (probe P5):

```
sign-in statuses: 401,401,401,429,429,429,429,429
sign-up statuses: 200,200,200,429,429,429
```

Two consequences.

**The throttle test passes for the wrong reason.** It sees 429 on attempt 4, not somewhere near 30. Fine as an assertion, misleading as documentation, and the plan's note about brittleness should be deleted rather than kept.

**The suite throttles itself, nondeterministically.** The plan's specs perform **eleven signups** (auth 5, password-reset 1, security 5) and **three `/request-password-reset` calls**. Bucketing is `${ip}|${path}` — and `getIP` (`@better-auth/core/dist/utils/ip.mjs:201`) reads only `x-forwarded-for`, falling back to `127.0.0.1` in dev/test and to the shared literal `no-trusted-ip` in production. Playwright sends no `x-forwarded-for`. So every test, in every worker, shares one bucket per path.

- Four signups inside any 10-second window → the fourth gets 429. The IDOR test alone does two signups back-to-back, and the XSS test's signup follows immediately.
- `/request-password-reset` allows exactly 3 per 60 s and the suite makes exactly 3 — with `retries: 1` in CI, a retry makes 4. The failure mode is nasty: the forgot-password page **deliberately ignores the response** (D1.9), so the UI still renders "Check your email", and the test then hangs for 15 s in `waitForEmail` and fails with `No email for … within 15000ms` — pointing at the mailer, which is fine.

**Patch — both halves probed.**

1. Make the limits ours instead of inheriting undocumented ones. Verified that `customRules` overrides the special rules (probe P5b: `sign-in` with `max: 10` gives ten 401s then 429; `sign-up` with `max: 50` gives six 200s). In Task 5 Step 6:

```ts
  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED,
    window: 60,
    max: 30,
    // Better Auth ships default special rules that OVERRIDE the base for these
    // paths: /sign-in* and /sign-up* are 3 per 10s, /request-password-reset is
    // 3 per 60s. Verified in dist/api/rate-limiter/index.mjs and by running the
    // handler. Undocumented defaults are not a security posture — state ours.
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 20 },
      '/request-password-reset': { window: 60, max: 20 },
    },
  },
```

`/sign-in/email` at 10-per-minute is still a real brute-force control, still observable by the throttle test, and no longer trips on the suite's own two legitimate logins.

2. Give each e2e test its own bucket. Verified that `getIP` honours a single-value `x-forwarded-for` with no `trustedProxies` configuration (P5), and that Playwright's `use.extraHTTPHeaders` reaches both `page` and the `request` fixture (probe P6: `PAGE BODY: xff=203.0.113.42`, `REQUEST BODY: xff=203.0.113.42`). Add to `apps/web/playwright.config.ts`:

```ts
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // Rate limits bucket on ${ip}|${path}, and getIP falls back to a single
    // shared key when no x-forwarded-for is present — so without this every
    // test in the suite shares one bucket. Verified: a single-value XFF is
    // honoured with no trustedProxies config.
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.1' },
  },
```

and in `security.spec.ts`, give the throttle test its own address so it cannot poison anything else:

```ts
test.describe('throttling', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.99' } })
  test('throttles repeated failed logins', async ({ request }) => { /* … as written … */ })
})
```

3. Add a deviations row and a Stage-2 note: an unvalidated `x-forwarded-for` is honoured by default. That is fine on localhost and is a rate-limit bypass the moment the app is reachable, so Stage 2 must set `advanced.ipAddress.trustedProxies`. Behind a multi-hop proxy the header has more than one entry and `getIPFromHeader` returns `null`, collapsing every user into one global bucket — worth knowing before it happens.

---

## 4. High-priority findings

### 4.1 The cookie test fails under `CI=1`

`advanced.useSecureCookies: env.NODE_ENV === 'production'` is true under `next start`. Better Auth then renames the cookie. Verified (probe P7):

```
useSecureCookies:false → tether.session_token=…;          Path=/; HttpOnly; SameSite=Lax
useSecureCookies:true  → __Secure-tether.session_token=…; Path=/; HttpOnly; Secure; SameSite=Lax
```

`cookies.find((c) => c.name.startsWith('tether'))` returns `undefined` and the assertion `session … toBeTruthy()` fails in exactly the mode the DoD requires.

I checked whether this kills the whole authenticated suite in CI mode, and it does not: Chromium **does** store a `__Secure-` cookie over `http://localhost` (probe P7b) — localhost is a trustworthy origin — so only this one test breaks.

**Patch.** Match the suffix, and assert `Secure` conditionally so the test proves the real posture in both modes:

```ts
  const session = cookies.find((c) => c.name.endsWith('tether.session_token'))
  expect(session, 'a tether session cookie should be set').toBeTruthy()
  expect(session?.httpOnly).toBe(true)
  expect(session?.sameSite).toBe('Lax')
  // useSecureCookies follows NODE_ENV; `next start` (CI=1) sets it, `next dev` does not.
  expect(session?.secure).toBe(!!process.env.CI)
```

### 4.2 The A10 "no stack trace" test fails in dev, and does not test what it claims

`@trpc/server@11.18.0`, `getErrorShape`:

```js
if (config.isDev && typeof opts.error.stack === "string") shape.data.stack = opts.error.stack;
```

`isDev` defaults to `NODE_ENV !== 'production'`, and the plan's `errorFormatter` returns `shape` untouched outside production. So under Task 12 **Step 5** (`pnpm --filter @tether/web e2e` against `pnpm dev`) the response body carries a stack full of `/Users/antoshkah/…` paths and `expect(body).not.toContain('/Users/')` fails. Step 5's "Expected: 17 passed" cannot happen.

Separately, the request the test makes is unauthenticated, so it produces `UNAUTHORIZED` — a clean 401 — not the "forced server error" spec §5 A10 promises to verify.

**Patch.** Make it a production-only assertion *and* make it actually force an internal error:

```ts
test('does not leak internals when a request fails', async ({ request }) => {
  // A10. tRPC attaches data.stack whenever isDev (NODE_ENV !== 'production'),
  // so this control only exists on the production path — which is the path CI
  // serves. Verified in @trpc/server 11.18.0 getErrorShape.
  test.skip(!process.env.CI, 'errorFormatter only strips internals in production')
  const res = await request.post('/api/trpc/profile.update?batch=1', {
    data: { 0: { json: { name: 12345 } } },
    failOnStatusCode: false,
  })
  const body = await res.text()
  expect(res.status()).toBeGreaterThanOrEqual(400)
  expect(body).not.toContain('/Users/')
  expect(body).not.toContain('node_modules')
  expect(body.toLowerCase()).not.toContain('at async')
})
```

and adjust Task 12 Step 5's expected count to `16 passed, 1 skipped`.

### 4.3 The username-availability oracle is not rate-limited at all

Spec §5 A06 states the oracle is "accepted, but rate-limited and returning only a boolean", and lists "E2E: repeated availability checks get throttled" as the verification. Task 7's router repeats it: *"covered by the global rate limit"*.

It is not. Better Auth's limiter runs inside `auth.handler`, which is mounted at `/api/auth/[...all]`. `checkUsernameAvailable` is a tRPC procedure at `/api/trpc/*` and never passes through it. There is no throttle, and the plan writes no test for the one spec §5 says exists — so the gap would not have been caught by the suite either.

This matters more than it looks: the signup form calls it on a 300 ms debounce, so it is a fast, unauthenticated, cheap `SELECT` against an indexed column that enumerates the entire user table.

**Patch.** Either implement the control or downgrade the claim in writing — do not ship the sentence without the thing. The cheap implementation, consistent with "rate limits are per-instance and in-memory" which spec §5 already discloses, is a small middleware in `init.ts`:

```ts
/** A06. tRPC does not pass through Better Auth's limiter; this is that limiter. */
const buckets = new Map<string, { count: number; resetAt: number }>()
export const rateLimited = (max: number, windowMs: number) =>
  t.middleware(({ ctx, next, path }) => {
    const key = `${ctx.ip ?? 'unknown'}|${path}`
    const now = Date.now()
    const b = buckets.get(key)
    if (!b || now > b.resetAt) buckets.set(key, { count: 1, resetAt: now + windowMs })
    else if (++b.count > max) throw new TRPCError({ code: 'TOO_MANY_REQUESTS' })
    return next()
  })
```

with `ip` added to `Context` from `opts.headers?.get('x-forwarded-for')`, `checkUsernameAvailable: publicProcedure.use(rateLimited(30, 60_000))`, and an e2e test that fires 40 checks and expects a 429. If you would rather defer it, that is a legitimate Phase 8 call — but then spec §5 A06 must say "not rate-limited in Phase 1" and the "what this does not cover" list must gain a bullet. §5 already earns its credibility by being precise about limits; this is the row that breaks the pattern.

### 4.4 A09's structured auth logging is never emitted

Spec §5 A09: *"Structured auth-event logging (pino): signup, login success **and failure**, password reset requested/completed, throttle triggered. User id only — never passwords, tokens, or full session ids."*

What the plan actually builds: a `redact()` function, three unit tests for it, an `AuthEvent` union of seven values — and exactly one call site, in `sendEmail`, hard-coded to `'auth.reset.requested'` **for verification emails too** (Task 4 Step 9). Six of the seven events are never emitted. The one that is, is mislabelled half the time. Nothing logs a failed login, which is the single event the category is about.

The call also logs `to` — the recipient's email address — which directly contradicts the spec's own "User id only" rule and is the one piece of PII in the flow.

**Patch.**
1. In `mailer.ts`, take the event as a parameter (`sendEmail(to, email, event: AuthEvent)`) and log `{ event, userId }`, not `{ to, subject }`. The two call sites in the auth config already have `user.id`.
2. Wire the rest through Better Auth's hooks, which exist for this. In Task 5 Step 6 add:

```ts
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const p = ctx.path
      if (p === '/sign-up/email') authLog('auth.signup', { userId: ctx.context.newSession?.user.id })
      if (p === '/sign-in/email')
        authLog(ctx.context.newSession ? 'auth.login.success' : 'auth.login.failure', {
          userId: ctx.context.newSession?.user.id,
        })
      if (p === '/sign-out') authLog('auth.logout')
      if (p === '/reset-password') authLog('auth.reset.completed')
    }),
  },
```

I did **not** execute this hook block, so treat it as a sketch to verify in Task 5 rather than as probed code — `createAuthMiddleware` is exported from `better-auth/api` and the `hooks.after` shape is documented, but the exact `ctx.context.newSession` field on a failed sign-in is the part to check with a `console.log` before relying on it. `auth.throttled` cannot be emitted from an `after` hook because the limiter short-circuits earlier; either drop it from the union or log it from the tRPC middleware in §4.3.

3. Add the unit test spec §5 A04 promises and the plan omits: `authLog('auth.login.failure', { password: 'hunter2', token: 'x' })` produces a line containing neither value.

### 4.5 Three more spec §5 verifications have no test

Beyond §4.3 and §4.4, these rows of the control matrix list a test that the plan never writes:

| Spec §5 row | Promised verification | Status in the plan |
|---|---|---|
| A01 | "Unit: no profile procedure takes a `userId` input" | Absent. Cheap and worth having as a regression guard for Phase 4 — assert over `appRouter.profile._def.procedures` that no input schema has a `userId` key |
| A10 | "Unit: session-lookup failure yields unauthenticated, not authorized" | Absent. This is the one A10 control that is pure logic and trivially testable: inject a `getSession` that throws, assert `createContext()` resolves with `user: null`. Requires making the session lookup injectable, which is worth doing anyway |
| A06 | "E2E: reset response is byte-identical for a known and an unknown email" | The test only checks that the *unknown* address renders `reset-requested`. It never compares the two, and never compares bytes |

For A06, the honest version compares the actual HTTP responses, and it passes — Better Auth returns the same body for both (verified, P8: `{"status":true,"message":"If this email exists in our system, check your email for the reset link"}` for a real address and for a nonexistent one, both `200`):

```ts
test('reset response is identical for a known and an unknown email', async ({ request }) => {
  const known = /* an email signed up in this test */
  const a = await request.post('/api/auth/request-password-reset', { data: { email: known, redirectTo: '/reset-password' } })
  const b = await request.post('/api/auth/request-password-reset', { data: { email: uniqueEmail('nobody'), redirectTo: '/reset-password' } })
  expect(a.status()).toBe(b.status())
  expect(await a.text()).toBe(await b.text())
})
```

Mind §3.4 when adding this: it is a third and fourth call into a bucket that allows three.

### 4.6 `/verify-email` is unreachable dead code

Verified in `better-auth/dist/api/routes/sign-up.mjs:252`:

```js
const callbackURL = body.callbackURL ? encodeURIComponent(body.callbackURL) : encodeURIComponent("/");
const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
```

and observed live in the probe: `…/api/auth/verify-email?token=…&callbackURL=%2F`. The signup page passes no `callbackURL`, so clicking the link lands on `/`. Nothing in the plan or the DoD ever visits `/verify-email`, and the page hard-codes "Email confirmed" regardless of outcome — so if it is ever reached directly, it lies.

**Patch.** One of two, not neither:
- pass `callbackURL: '/verify-email'` in `signUp.email({...})` and add an e2e step that follows the emailed link and asserts `verify-result` (this also converts D1.5's "the pipeline is proven" from "an email arrived" to "the round trip works"); **or**
- delete the page and the file-structure row.

### 4.7 `inferAdditionalFields` is a type-only shim — and the plan is about to write the wrong lesson into `learnings.md`

The plan's Verified-facts row is right about compile time. The elaboration in Task 9 Step 1 ("would not send it at runtime") and Task 14 Step 2's proposed learnings entry ("without it `username` is silently absent from the request") are wrong. The whole plugin is:

```js
const inferAdditionalFields = (schema) => {
  return { id: "additional-fields-client", version: PACKAGE_VERSION, $InferServerPlugin: {} };
};
```

No runtime behaviour whatsoever. It exists purely so `typeof auth` can widen the client's types; the client sends whatever body it is given either way.

This matters more than the average nit because `docs/learnings.md` is a permanent artefact and its inclusion test is "would knowing it a day earlier have saved time" — a false lesson costs time forever. Correct the entry to: *"`inferAdditionalFields` is a compile-time-only shim; it is required for `signUp.email({ username })` to typecheck and has no runtime effect. The runtime requirement is different and harsher: an `additionalField` cannot be both `required: true` and `input: false`."* That second sentence is the lesson §3.1 actually teaches, and it is the one worth keeping.

### 4.8 Three decision rows are missing from `PRD.md` §10

Task 14 Step 3: *"The decision-log rows D1.1–D1.9 are already in §10 from the spec stage, so no new row is needed."* §10 currently carries D1.1, D1.2, D1.3, D1.5, D1.6, D1.8, plus the scrypt and OWASP-2025 rows. **D1.4, D1.7 and D1.9 are absent.** Spec §7's own DoD says "§10 carries D1.1–D1.9". Add the three rows in Task 14 Step 3 before editing the §7 goal cell, per L12.

While there: `PRD.md` §4.1 lists self-serve account deletion as v1 scope, and spec §1 moves it to v2 with no §10 row. That is a PRD deviation and PRD deviations have exactly one home. Add a row, or put it back in scope.

---

## 5. Medium and low findings

| # | Where | Finding | Fix |
|---|---|---|---|
| M1 | Task 3 schema | `getAuthTables()` reports `account.indexes: [{ fields: ['issuer','accountId'], unique: true }]`. The hand-written table has only `account_user_id_idx`. The schema is described as coming from that dump; this row was dropped | Add `uniqueIndex('account_issuer_account_id_idx').on(t.issuer, t.accountId)` |
| M2 | Tasks 4–5 | Web unit-test counts are wrong. Actual: 6 after templates, 9 after log, 13 after guard. Plan says 7, 10, 11 — and 11 is lower than its own preceding 10 | Correct to 6 / 9 / 13. (The `@tether/shared` counts, 20 and 32, are **right** — verified: 15 tests pass today) |
| M3 | Task 13 Step 2 | "Expected: `No known vulnerabilities found`" is not what this repo prints. Actual today: `1 vulnerabilities found / Severity: 1 moderate`, exit 0 — esbuild GHSA-67mh-4wv8-2f99 via `drizzle-kit > @esbuild-kit/*` | State the real expected output, and note that `--audit-level=high` intentionally passes over it so nobody "resolves" a moderate transitive dev advisory that has no fix path |
| M4 | Task 5 / Task 9 | A taken username and an invalid username both surface as `422 {"code":"FAILED_TO_CREATE_USER"}` — the before-hook's `Invalid username: …` message is swallowed. Verified. The e2e passes because it only asserts `form-error` is visible | Check availability server-side in `signUp` before calling Better Auth, or map the 422 to "That username is taken" in the signup page. Do not leave "Could not create the account." as the only feedback for the most common failure in the flow |
| M5 | Task 5 | Signup leaks membership: a duplicate email returns `422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`. Verified. D1.9 closes the reset oracle but signup reopens it | Either accept it explicitly in spec §5 A06 alongside the username oracle (it is Better Auth's default and hard to avoid without hurting UX), or note it in "what this does not cover" |
| M6 | Task 7 | `getOrCreateProfile` issues an INSERT on every profile *read*, and returns the row from before that insert. Correct, but a write on a query path | Insert first, then select; or select, and only insert when the join came back null |
| M7 | Task 5 | `drizzleAdapter(db(), { provider: 'pg' })` works only because `createDb` passes `{ schema }`, populating `db._.fullSchema`. Verified both ways: the adapter throws `Schema not found` without it, and works when `schema` is passed explicitly even with an empty `_.fullSchema` | Pass it: `drizzleAdapter(db(), { provider: 'pg', schema })`. One import, removes a silent coupling to how the client happens to be constructed |
| M8 | Task 1 Step 6 | Says "Replacement, not append — the Phase 0 lesson about duplicate secret lines", then the command is `cat >> .env.local` followed by a `sed`. It works, but the comment describes something the code does not do | Say what it does: append the block once, then substitute the placeholder |
| M9 | Throughout | The code blocks are not Biome-ordered (`@tether/shared/db` before `@tether/shared` in Task 7 Step 2; `Suspense, type FormEvent, useState` in Task 10 Step 2). `pnpm lint` is in the DoD and `biome check` fails on unsorted imports | Add "run `pnpm format` before each commit" to the task template, or fix the blocks |
| M10 | Task 12 Step 4b | Uses `await import('./helpers/mailpit')` inside a test for helpers the same file already imports statically at the top | Add the three names to the top-level import |
| M11 | Task 12 | The XSS test is close to vacuous: `name` is only ever rendered into an `<input value>`, never as text. It would pass against an app with no escaping at all | Render the display name as text somewhere on `/profile` (the header is the natural place) and assert on it, or move the assertion to the email body where the payload genuinely reaches an HTML renderer |
| M12 | Task 5 | `x-forwarded-for` is honoured with no `trustedProxies` configured (verified). Fine on localhost; a rate-limit bypass the moment the app is reachable, and behind a multi-hop proxy `getIPFromHeader` returns `null` and collapses all users into one bucket | Deviations row + a Stage-2 checklist item to set `advanced.ipAddress.trustedProxies` |
| M13 | Spec §1 | `PRD.md` §4.1 has self-serve account deletion in v1; the spec defers it to v2 with no decision-log row | §10 row, per §4.8 |
| M14 | Spec §8 / plan | Spec §8 says `@better-auth/cli` is "currently 1.4.21"; the newest publish is **1.4.22** (2026-03-16). The plan's date is right, the version is one behind. The conclusion — six months stale, hand-write the schema — is correct either way | Correct the version number |

---

## 6. Verification probes

Rerunnable evidence for everything marked verified. All run 2026-09-06 on Node 24.20.0 (`export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"`), in a scratch directory with `better-auth@1.7.1 drizzle-orm@0.45.2 postgres@3.4.7 nodemailer@9.0.5 next@16.3.4` installed. Nothing was installed into the repo and nothing in the repo was modified (`git status --short` is empty).

### P1 — signup through the real handler, with the plan's exact config

Create `probe1` in the running container, apply the plan's Task 3 DDL, then build the plan's Task 5 config verbatim (adapter, hooks, `additionalFields`) and call it:

```js
const res = await auth.api.signUpEmail({
  body: { email, password: 'correct-horse-battery', name: 'Alice Example', username: 'Alice_01' },
  asResponse: true,
})
console.log(res.status, await res.text())
```

**As the plan writes it (`usernameLower: required: true`):**
```
STATUS 400
BODY {"message":"usernameLower is required","code":"MISSING_FIELD"}
```
The `before` hook's `console.log` never fires — validation precedes `databaseHooks`.

**P1b — with `required: false` (the §3.1 patch):**
```
BEFORE HOOK input: {…,"username":"Alice_01","emailVerified":false}
AFTER HOOK created: {…,"username":"Alice_01","usernameLower":"alice_01","id":"CQZxyb…"}
STATUS 200
USER ROWS: [{…,"username":"Alice_01","usernameLower":"alice_01"}]
PROFILE ROWS: [{"userId":"CQZxyb…","bio":null,"homeCity":null,"avatarKey":null}]
```

**P1c — duplicate username, different case:**
```
{"status":422,"body":"{\"message\":\"Failed to create user\",\"code\":\"FAILED_TO_CREATE_USER\"}"}
cause: duplicate key value violates unique constraint "user_username_lower_idx"
rows after dup attempt: 1 users
duplicate email: {"status":422,…"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"}
final users: 1   final accounts: 1
```

Also confirmed in the same session: `getAuthTables()` with the plan's config reports `user.username` and `user.usernameLower` with **no `fieldName`** (so the adapter uses the property key — the plan's camelCase Drizzle property names are correct), `account.indexes` carries the composite unique the plan omits (M1), `ctx.rateLimit` resolves to `{"enabled":true,"window":60,"max":30,"storage":"memory"}` — memory storage, so no `rateLimit` table is needed and the hand-written four-table schema is complete in that respect.

### P2 — the boot guard fires during `next build`

Minimal Next 16.3.4 app, one route handler at `src/app/api/auth/[...all]/route.ts` carrying the guard's exact shape at module scope:

```bash
REQUIRE_EMAIL_VERIFICATION=false npx next build
```
```
Collecting page data using 5 workers ...
MODULE EVAL: NODE_ENV= production NEXT_PHASE= phase-production-build
Error: Failed to collect configuration for /api/auth/[...all]
  [cause]: Error: GUARD FIRED: Unsafe auth configuration for production
> Build error occurred
```

**P2b — the same module under `next start`:**
```
✓ Ready in 94ms
MODULE EVAL: NODE_ENV= production NEXT_PHASE= <undef>
HANDLER RUN:  NODE_ENV= production NEXT_PHASE= <undef>
```
`phase-production-build` is present during build and absent at serve time — the basis for the §3.2 patch.

### P3 — Turbo runs in strict env mode and filters undeclared variables

```bash
pnpm exec turbo run build --dry=json   # in the repo
# envMode: strict
# @tether/web#build specified.env: ["NEXT_PUBLIC_APP_URL","NEXT_PUBLIC_HOCUSPOCUS_URL"]
```

Scratch workspace on the same `turbo@2.10.12`, task `env: ["DECLARED_VAR"]`:

```bash
DECLARED_VAR=yes UNDECLARED_VAR=leaked npx turbo run build
# a:build: DECLARED= yes UNDECLARED= <undef>
```

### P4 — nodemailer under the production build, and the Mailpit API shape

`nodemailer@9.0.5` + `@types/nodemailer@8.0.1` in a route handler, `next build && next start`, one `sendMail` to the running Mailpit:

```
{"ok":true,"id":"<d6e2562a-…@tether.local>"}
found 1
Subject: Probe subject
Text: 'Reset your password:\r\nhttp://localhost:3000/api/auth/reset-password/AVERYLONGTOKEN0123456789abcdefghijklmnop?callbackURL=%2Freset-password\r\n\r\nbye'
HTML: '<p>Hi &lt;script&gt;,</p>'
```
No `serverExternalPackages` entry needed; the long URL is returned decoded and unbroken, so `firstLink(mail.text)` works. Without `@types/nodemailer` the build fails at `TS7016`.

### P5 — the rate limiter's real rules

Read `better-auth/dist/api/rate-limiter/index.mjs`: `getDefaultSpecialRules()` → `/sign-in|/sign-up|/change-password|/change-email` at `window: 10, max: 3`; `/request-password-reset|/send-verification-email|/forget-password` at `window: 60, max: 3`. Key is `${ip}|${path}`; `getIP` reads only `x-forwarded-for` and falls back to `127.0.0.1` in dev/test, `no-trusted-ip` otherwise.

Driving `auth.handler` with real `Request`s, one `x-forwarded-for`:

```
sign-in statuses: 401,401,401,429,429,429,429,429
sign-up statuses: 200,200,200,429,429,429
```

**P5b — `customRules` overrides the special rules, and distinct IPs get distinct buckets:**
```
sign-in with customRules max 10: 401,401,401,401,401,401,401,401,401,401,429,429,429
sign-up with customRules max 50: 200,200,200,200,200,200
distinct IPs (198.51.100.100…105): 401,401,401,401,401,401
```

`ctx.rateLimit.enabled` default confirmed as `options.rateLimit?.enabled ?? isProduction` in `dist/context/create-context.mjs:171` — the plan's D1.8 and probe P4 both reproduce.

### P6 — Playwright `extraHTTPHeaders` reaches both `page` and `request`

```ts
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.42' } })
```
```
PAGE BODY:    xff=203.0.113.42
REQUEST BODY: xff=203.0.113.42
```

### P7 — cookie attributes, and `__Secure-` over http://localhost

```
useSecureCookies:false → tether.session_token=…;          Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax
useSecureCookies:true  → __Secure-tether.session_token=…; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax
```

**P7b — Chromium 1.62.1 against a plain-http localhost server that sets both:**
```json
[{"name":"__Secure-tether.session_token","domain":"localhost","httpOnly":true,"secure":true,"sameSite":"Lax"},
 {"name":"tether.plain","domain":"localhost","httpOnly":true,"secure":false,"sameSite":"Lax"}]
```
Both are stored — so §4.1 breaks one assertion, not the suite.

### P8 — the password-reset flow

```
requestPasswordReset (known):   200 {"status":true,"message":"If this email exists in our system, check your email for the reset link"}
requestPasswordReset (unknown): 200 {"status":true,"message":"If this email exists in our system, check your email for the reset link"}
emailed URL: http://localhost:3000/api/auth/reset-password/ZDblucrK…?callbackURL=%2Freset-password
auth.api.getSession({ headers: new Headers() }) -> null
api keys: …resetPassword, verifyEmail, sendVerificationEmail, changePassword, requestPasswordReset, revokeSessions…
```

`/reset-password/:token` redirects to `callbackURL?token=…` (`dist/api/routes/password.mjs:129`), which is what the plan's page reads. `resetPassword` calls `consumeVerificationValue` — single-use, so the replay assertion is sound. `revokeSessionsOnPasswordReset` is a real option (`@better-auth/core/dist/types/init-options.d.mts:744`) and deletes the user's sessions (`password.mjs:173`). `toNextJsHandler` and the `/ok` endpoint both exist. `forgetPassword` is absent, `requestPasswordReset` present — the plan is right.

### P9 — CSP does not break dev, HMR, hydration, or the Hocuspocus socket

Next 16.3.4 (Turbopack) with the plan's exact `securityHeaders`, a `'use client'` component that opens `ws://localhost:1234`, driven by Chromium with a console/pageerror listener:

```
next dev   → WS STATUS: ws-open   BUTTON AFTER CLICK: n=1   VIOLATIONS: (none)
next start → WS STATUS: ws-open   BUTTON AFTER CLICK: n=1   VIOLATIONS: (none)
```
`connect-src 'self' ws: wss:` permits the socket; `script-src 'self' 'unsafe-inline'` is sufficient — Turbopack dev needs no `'unsafe-eval'`.

### P10 — Playwright's `request` fixture is cookie-isolated but inherits `baseURL`

`playwright/lib/index.js:174` — `request: async ({ playwright }, use) => { const request = await playwright.request.newContext() … }`. Empirically, after `page.goto('/set')` sets a cookie:

```
PAGE COOKIES:            ["probe"]
REQUEST FIXTURE RESULT:  url=/echo cookie=<none>
CONTEXT.REQUEST RESULT:  url=/echo cookie=probe=frompage
```
Relative paths resolve, so `baseURL` is honoured. All four of the plan's `request` tests want an anonymous caller — correct as written. Use `context.request` if a future test needs the logged-in session.

### P11 — registry dates and the current audit state

```bash
npm view better-auth time --json   # 1.7.1 2026-08-18, 1.7.2 2026-08-26, 1.7.3 2026-09-06
npm view nodemailer time --json    # 9.0.5 2026-08-07, 9.0.6 2026-08-27, 10.0.0 2026-09-04
npm view @better-auth/cli time --json  # newest 1.4.22 2026-03-16
pnpm audit --audit-level=high      # 1 vulnerabilities found / Severity: 1 moderate — exit 0
```

---

## 7. What the plan gets right

Briefly, because the words belong in §3 and §4 — but these are real and should survive the revision unchanged.

- **The security spec is the best artefact in this repo.** Mapped to the 2025 list, not the remembered one. Every control paired with something that executes. A "what this does not cover" section that names TLS, alerting, SAST, pen testing, trip-level authz and multi-instance limits. §5's honesty is what makes its claims worth anything — which is exactly why §4.3's unbacked "rate-limited" is worth fixing rather than shrugging at.
- **D1.8.** Finding a security default whose *value* is wrong rather than absent is the hard version of this work, and L17 generalised it correctly.
- **D1.9 and the forgot-password page.** Deliberately discarding the result so no branch can leak membership is the right instinct, and it happens to match Better Auth's own uniform response (P8).
- **Version selection under pressure.** 1.7.3 shipped the morning this plan was written and was correctly refused. Every date re-resolves.
- **Rejecting `@better-auth/cli` on evidence** and hand-writing the schema. The dump is otherwise faithfully transcribed — property names, nullability, cascade FKs, the `id` column and `account.issuer` all match `getAuthTables()`.
- **`envBool`.** `z.coerce.boolean()` really does treat `"false"` as `true`; the comment explaining why is the kind that saves a future reader an hour.
- **Boundary discipline inherited without restatement.** SQL in `packages/shared/src/db/`, username rules on the browser-safe barrel, both bundle greps kept in the DoD.
- **`username.ts` itself.** The reserved-word denylist is load-bearing for Phase 6 URLs and the plan says so; the tests cover the interesting cases including the case-collision one.
- **The `try/catch` after-hook plus lazy repair (D1.4)**, and the reasoning that a profile failure must never block account creation. Verified working.

---

## 8. Next step

Apply §3 (four blockers) and §4 (eight items) to the plan, then re-score rows 2, 3, 4, 6, 7, 11 and 13.

Three of the four blockers are one-line or one-block edits with patches already probed above: `required: false` (§3.1), `customRules` + `extraHTTPHeaders` (§3.4), and the Turbo/CI env plus the Mailpit service (§3.3). The fourth (§3.2) is the only one that adds a concept — `APP_STAGE` — and it is a concept `PRD.md` §7b already owns; the guard, its test, and the DoD line all follow from it mechanically.

Before executing, record in the plan's revision log that the two claims which cost the most here were both *statically* verified and *dynamically* wrong: a config shape that typechecks and 400s, and a rate limit whose configured value is never the value in force. The Phase 0 lesson was "probe, don't assert". The Phase 1 lesson is narrower and sharper: **a typecheck is not a probe — run the request.**
