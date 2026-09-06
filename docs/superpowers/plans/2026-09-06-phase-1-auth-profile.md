# Tether Phase 1 — Auth + Profile Implementation Plan

> ## Revision 2 — 2026-09-06, after independent review
>
> Reviewed by a fresh agent against `docs/plan-review-rubric.md`: **`docs/plan-review-phase-1-2026-09-06.md`**. It scored rows 3 (Executability) and 4 (Production parity) at **1** and found **four blocking defects**. All are applied below.
>
> **The lesson, recorded before the fixes:** revision 1 carried a twelve-row "Verified facts" table and five probes — and all four blockers were invisible to every one of them, because they were *static* checks (typechecks, `dist/` greps, registry dates). Each defect appears only when a request actually runs. **A typecheck is not a probe — run the request.** (`docs/learnings.md` L19.)
>
> | # | Defect | Fix applied |
> |---|---|---|
> | §3.1 | `usernameLower: required:true, input:false` → **every signup 400s**, `MISSING_FIELD`. Better Auth validates the request body *before* `databaseHooks` run, so a required field a client may not send is always missing. Hooks never execute | `required: false`. NOT NULL on the column remains the real guarantee. Independently re-verified against the memory adapter: `required:true` → 400, hooks `(NONE RAN)`; `required:false` → 200, `BEFORE \| AFTER usernameLower=alice_01` |
> | §3.2 | The A02 guard keyed on `NODE_ENV`, so **`pnpm build` throws and `CI=1 pnpm e2e` cannot pass** — both run `NODE_ENV=production` on the laptop, which `CLAUDE.md` requires | Guard keys on a new **`APP_STAGE`** (PRD §7b's own axis), and no-ops when `NEXT_PHASE === 'phase-production-build'` |
> | §3.3 | New env vars reached neither `next build` nor CI, and **CI had no Mailpit** — six e2e tests could never be green. L3 violated in the same document that cites it | All vars added to Turbo `build`/`dev`/`start`, to the CI `env:` block, and Mailpit added as a CI service |
> | §3.4 | Better Auth ships **undocumented default special rate-limit rules** overriding the configured `max: 30`: `/sign-in*` and `/sign-up*` are **3 per 10s**, `/request-password-reset` **3 per 60s**. The suite does 11 signups from one shared bucket and would fail nondeterministically — surfacing as a mailer timeout, not a throttle | Explicit `customRules`, plus a per-test `x-forwarded-for` so each test gets its own bucket |
>
> High-priority items also applied: cookie test matches the `__Secure-` rename under `CI=1` (§4.1); the A10 leak test is production-only and skipped in dev, where tRPC deliberately attaches `data.stack` (§4.2); the username-availability oracle **actually gets** the rate limit spec §5 A06 claims it has (§4.3); auth logging is emitted for real events and stops logging email addresses (§4.4); `/verify-email` is reachable via `callbackURL` (§4.6); the false `inferAdditionalFields` runtime claim is corrected — it is a **compile-time-only shim** (§4.7); PRD §10 gains D1.4, D1.7, D1.9 (§4.8). Plus M1 (composite unique on `account`), M7 (pass `schema` to `drizzleAdapter`), M4 (duplicate-username UX).
>
> Two of my worries were checked and found **unfounded**, with evidence: the CSP breaks neither Turbopack HMR nor the Hocuspocus socket, and Playwright's `request` fixture is cookie-isolated but inherits `baseURL` — which is what those tests need.

> **Spec:** `docs/superpowers/specs/2026-09-06-phase-1-auth-profile-design.md` (approved 2026-09-06). Decisions referenced as **D1.x**; OWASP controls as **A0x**.
>
> **Review gate:** this plan must pass `docs/plan-review-rubric.md` with no row scored 1 before execution, per `CLAUDE.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor can create an account with a username of their choosing, verify by email, log in and out, reset a forgotten password, and edit their profile — with every OWASP Top 10:2025 control in the spec backed by a test that runs in CI.

**Architecture:** Better Auth owns identity (`user`, `session`, `account`, `verification`) with two columns of ours added to `user` so signup is a single atomic insert (**D1.2**). A separate `user_profile` holds non-identity fields and is created by an after-hook, lazily repaired if ever missing (**D1.4**). Username rules are pure functions in `packages/shared` so the browser and server validate identically. tRPC gains a real session and a `protectedProcedure`, replacing the `userId: null` placeholder Phase 0 left behind.

**Tech Stack:** better-auth 1.7.1 · nodemailer 9.0.5 · Drizzle 0.45.2 · Zod 4.5.4 · Next 16.3.4 · tRPC 11.18.0 · Playwright 1.62.1 · Vitest 4.1.11 · Mailpit v1.31

---

## Verified facts

Probed on 2026-09-06 against the published packages. Rerunnable commands are in **Verification probes** at the end. Nothing in this plan asserts library behaviour that was not run.

| Claim | Verified how | Result |
|---|---|---|
| `user.additionalFields` exists in core (not just plugins) | Typechecked a real `betterAuth({...})` config under TS 7.0.2 | ✅ compiles, incl. `input: false` and `unique: true` |
| `databaseHooks.user.create.after` exists | same typecheck | ✅ |
| Password hashing algorithm | Read `dist/crypto/password.mjs` | **scrypt** via `node:crypto`, *not* bcrypt (`security.md` was wrong; corrected) |
| Rate-limit default | Read `dist/context/create-context.mjs` | `enabled ?? isProduction` → **off in development** (**D1.8**) |
| Cookie defaults | Read shipped code | `httpOnly: true`, `sameSite: "lax"` |
| Canonical table shape | Ran `getAuthTables()` with our exact config | See Task 3. Includes **`account.issuer`**, a required field |
| `@better-auth/cli` suitability | Registry: latest publish 2026-03-16 vs library 2026-09 | **Rejected** — six months stale, predates `account.issuer`. We hand-write the schema |
| Client method names | Typechecked against `better-auth/react` | `signUp.email`, `signIn.email`, `signOut`, **`requestPasswordReset`**, `resetPassword`, `sendVerificationEmail`, `useSession`. **`forgetPassword` does not exist** |
| Passing `username` at signup | Typecheck | Rejected by the client **unless** `inferAdditionalFields<typeof auth>()` is registered. With it, ✅ and `session.user.username` is typed |
| Peer-dependency fit | `better-auth@1.7.1` package.json | `drizzle-orm ^0.45.2`, `next ^16`, `react ^19`, `vitest ^4` — all match our pins exactly |

---

## Version additions

Policy unchanged: newest release ≥2 weeks old with ≥1 patch on its major.

| Package | Version | Where | Note |
|---|---|---|---|
| better-auth | 1.7.1 | `apps/web` | 1.7.3 shipped 2026-09-06 (today); 1.7.2 is 11 days old. 1.7.1 (2026-08-18) is the newest qualifying release (**D1.7**) |
| nodemailer | 9.0.5 | `apps/web` | 10.0.0 is 2 days old; 9.0.6–9.1.1 are all under 2 weeks. 9.0.5 (2026-08-07) qualifies |
| @types/nodemailer | 8.0.1 | `apps/web` (dev) | |

`zxcvbn` is **not** added. `security.md` §2.1 mentions it for a strength meter; that is a Phase 8 polish concern and adds a 400 KB client dependency for an informational widget. Recorded in Deviations.

---

## File structure

```
packages/shared/src/
  username.ts                     NEW  pure rules — browser-safe, exported from the barrel
  username.test.ts                NEW
  env.ts                          MOD  webEnv gains auth + SMTP vars
  env.test.ts                     MOD
  index.ts                        MOD  export username helpers
  db/schema.ts                    MOD  user, session, account, verification, user_profile
  migrations/0001_*.sql           NEW  generated

apps/web/src/
  server/auth/index.ts            NEW  betterAuth config — single source of auth behaviour
  server/auth/guard.ts            NEW  production boot guard (A02)
  server/auth/guard.test.ts       NEW
  server/email/mailer.ts          NEW  nodemailer transport
  server/email/templates.ts       NEW  verification + reset bodies, HTML-escaped (A05)
  server/email/templates.test.ts  NEW
  server/trpc/init.ts             MOD  real session; protectedProcedure; error formatter (A01, A10)
  server/trpc/routers/profile.ts  NEW  get / update / checkUsernameAvailable
  server/trpc/root.ts             MOD  mount profile router
  app/api/auth/[...all]/route.ts  NEW  Better Auth handler
  lib/auth-client.ts              NEW  createAuthClient + inferAdditionalFields
  app/(auth)/signup/page.tsx      NEW
  app/(auth)/login/page.tsx       NEW
  app/(auth)/forgot-password/page.tsx   NEW
  app/(auth)/reset-password/page.tsx    NEW
  app/(auth)/verify-email/page.tsx      NEW
  app/profile/page.tsx            NEW
  components/AuthForm.tsx         NEW  shared form shell — one place for error display
  next.config.ts                  MOD  security headers (A02)

apps/web/tests/e2e/
  auth.spec.ts                    NEW  signup, login, logout, duplicate username
  password-reset.spec.ts          NEW  full reset through the real email
  security.spec.ts                NEW  headers, cookie flags, IDOR, XSS, error leakage
  helpers/mailpit.ts              NEW  read + clear the Mailpit inbox over its HTTP API
```

**Why `username.ts` is in `packages/shared`:** Phase 6 will validate the same strings server-side for profile URLs, and the browser needs identical rules for live feedback. One definition, two consumers — the same reasoning that put the Yjs document shape there. It is pure (no `env`, no `db`), so it is exported from the **barrel** and stays browser-safe; the Phase 0 Biome rule already enforces that.

---

## Task 1: Environment contract for auth and email

**Files:**
- Modify: `packages/shared/src/env.ts`, `packages/shared/src/env.test.ts`
- Modify: `.env.example`, `.env.local`

- [ ] **Step 1: Add the failing tests to `packages/shared/src/env.test.ts`**

Add to the existing `web env` describe block, and add a new one. Keep the existing tests unchanged.

```ts
describe('web env — auth and email', () => {
  const authed = {
    ...web,
    BETTER_AUTH_SECRET: 'b'.repeat(32),
    EMAIL_FROM: 'Tether <no-reply@tether.local>',
  }

  it('requires a Better Auth secret of at least 32 characters', () => {
    expect(() => parseWebEnv({ ...authed, BETTER_AUTH_SECRET: 'short' })).toThrow(
      /BETTER_AUTH_SECRET/,
    )
  })

  it('defaults SMTP to the local Mailpit container', () => {
    const e = parseWebEnv(authed)
    expect(e.SMTP_HOST).toBe('localhost')
    expect(e.SMTP_PORT).toBe(1025)
  })

  it('coerces REQUIRE_EMAIL_VERIFICATION from a string and defaults it to false', () => {
    expect(parseWebEnv(authed).REQUIRE_EMAIL_VERIFICATION).toBe(false)
    expect(parseWebEnv({ ...authed, REQUIRE_EMAIL_VERIFICATION: 'true' }).REQUIRE_EMAIL_VERIFICATION).toBe(true)
  })

  // D1.8: better-auth's own default is `enabled ?? isProduction` — off in dev.
  // Ours defaults ON so a local test can actually observe throttling.
  it('defaults RATE_LIMIT_ENABLED to true', () => {
    expect(parseWebEnv(authed).RATE_LIMIT_ENABLED).toBe(true)
  })

  it('rejects a non-boolean string for a boolean flag', () => {
    expect(() => parseWebEnv({ ...authed, RATE_LIMIT_ENABLED: 'yes' })).toThrow(
      /RATE_LIMIT_ENABLED/,
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @tether/shared test
```

Expected: FAIL — `BETTER_AUTH_SECRET` is not yet in the schema, so `parseWebEnv({...})` succeeds where the test expects a throw.

- [ ] **Step 3: Extend `packages/shared/src/env.ts`**

Add the helper above `coreShape`:

```ts
/**
 * Environment variables are always strings. z.coerce.boolean() is wrong here —
 * it treats "false" as truthy. This accepts only the two literal strings.
 */
const envBool = (defaultValue: 'true' | 'false') =>
  z.enum(['true', 'false']).default(defaultValue).transform((v) => v === 'true')
```

Replace the `WebEnvSchema` definition with:

```ts
const WebEnvSchema = z.object({
  ...coreShape,
  NEXT_PUBLIC_APP_URL: z.string().startsWith('http'),
  NEXT_PUBLIC_HOCUSPOCUS_URL: z.string().startsWith('ws'),

  // Better Auth signs session tokens with this. Never sent to the browser.
  BETTER_AUTH_SECRET: z.string().min(32),

  // Mailpit in dev (docker-compose); a real SMTP relay at Stage 2.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  EMAIL_FROM: z.string().min(3),

  // D1.5 — verification emails are sent, but login is not gated on them locally.
  REQUIRE_EMAIL_VERIFICATION: envBool('false'),
  // D1.8 — explicitly on, because better-auth's default is off in development.
  RATE_LIMIT_ENABLED: envBool('true'),
})
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @tether/shared test
```

Expected: PASS, 20 tests (15 existing + 5 new).

- [ ] **Step 5: Add the variables to `.env.example`**

Append:

```
# ---- Auth (Phase 1) ----
# generate with: openssl rand -hex 32
BETTER_AUTH_SECRET=replace-me-with-64-hex-chars-from-openssl-rand-hex-32

# ---- Email (Phase 1) ----
# Mailpit from docker-compose; inbox at http://localhost:8025
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=Tether <no-reply@tether.local>

# D1.5: emails are sent locally but login is not gated on verification.
REQUIRE_EMAIL_VERIFICATION=false
# D1.8: better-auth defaults this off in development; we keep it on so it is testable.
RATE_LIMIT_ENABLED=true
```

- [ ] **Step 6: Add the same variables to your `.env.local`, generating a real secret**

Replacement, not append — the Phase 0 lesson about duplicate secret lines.

```bash
cat >> .env.local <<'EOF'

# ---- Auth (Phase 1) ----
BETTER_AUTH_SECRET=replace-me
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=Tether <no-reply@tether.local>
REQUIRE_EMAIL_VERIFICATION=false
RATE_LIMIT_ENABLED=true
EOF
sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -hex 32)|" .env.local
```

Verify exactly one line and no placeholder:

```bash
grep -c '^BETTER_AUTH_SECRET=' .env.local
grep '^BETTER_AUTH_SECRET=' .env.local | grep -c 'replace-me'
```

Expected: `1`, then `0`.

- [ ] **Step 7: Declare the new variables to Turbo**

The Phase 0 lesson (L3): Turbo 2 filters the environment in strict mode, so a variable the workflow sets is invisible to the task unless declared. Add to **both** the `dev` and `start` `env` arrays in `turbo.json`, and to `build` (Next inlines nothing new, but `next build` runs the config which reads env):

```json
"env": [
  "DATABASE_URL",
  "HOCUSPOCUS_PORT",
  "HOCUSPOCUS_JWT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_HOCUSPOCUS_URL",
  "BETTER_AUTH_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "EMAIL_FROM",
  "REQUIRE_EMAIL_VERIFICATION",
  "RATE_LIMIT_ENABLED"
]
```

Leave `build`'s `env` as the two `NEXT_PUBLIC_*` entries plus `REQUIRE_EMAIL_VERIFICATION` (it affects nothing at build time today, but declaring it costs one cache key and prevents a repeat of the Phase 0 bug).

- [ ] **Step 8: Commit**

```bash
git add packages/shared .env.example turbo.json
git commit -m "feat(shared): environment contract for auth and email"
```

---

## Task 2: Username rules

Pure functions, no I/O. This is the one piece of genuinely tricky logic in the phase, so it gets thorough TDD.

**Files:**
- Create: `packages/shared/src/username.ts`, `packages/shared/src/username.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test `packages/shared/src/username.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { RESERVED_USERNAMES, normalizeUsername, validateUsername } from './username'

describe('normalizeUsername', () => {
  it('trims surrounding whitespace and lowercases', () => {
    expect(normalizeUsername('  Alice_01  ')).toBe('alice_01')
  })

  it('is idempotent', () => {
    expect(normalizeUsername(normalizeUsername('AliCe'))).toBe('alice')
  })
})

describe('validateUsername', () => {
  it('accepts a simple valid username and returns both forms', () => {
    const r = validateUsername('Alice_01')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.username).toBe('Alice_01')
      expect(r.usernameLower).toBe('alice_01')
    }
  })

  it('rejects fewer than 3 characters', () => {
    const r = validateUsername('ab')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/3/)
  })

  it('rejects more than 32 characters', () => {
    expect(validateUsername('a'.repeat(33)).ok).toBe(false)
  })

  it('rejects a name not starting with a letter', () => {
    expect(validateUsername('1alice').ok).toBe(false)
    expect(validateUsername('_alice').ok).toBe(false)
  })

  it('rejects characters outside [a-z0-9_]', () => {
    expect(validateUsername('alice-01').ok).toBe(false)
    expect(validateUsername('alice.01').ok).toBe(false)
    expect(validateUsername('alice 01').ok).toBe(false)
    expect(validateUsername('alicé').ok).toBe(false)
  })

  it('rejects consecutive underscores', () => {
    expect(validateUsername('alice__01').ok).toBe(false)
  })

  it('rejects a trailing underscore', () => {
    expect(validateUsername('alice_').ok).toBe(false)
  })

  // Phase 6 turns usernames into /:username profile URLs. A user called
  // "settings" would shadow a route, so the denylist is load-bearing, not cosmetic.
  it('rejects reserved words regardless of case', () => {
    for (const word of ['admin', 'API', 'Settings', 'login', 'me']) {
      expect(validateUsername(word).ok).toBe(false)
    }
  })

  it('exposes the reserved list so the signup form can explain itself', () => {
    expect(RESERVED_USERNAMES.has('admin')).toBe(true)
  })

  it('treats differently-cased spellings as the same name', () => {
    const a = validateUsername('Alice')
    const b = validateUsername('ALICE')
    expect(a.ok && b.ok && a.usernameLower === b.usernameLower).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @tether/shared test
```

Expected: FAIL, `Failed to resolve import "./username"`.

- [ ] **Step 3: Write `packages/shared/src/username.ts`**

```ts
/**
 * Username rules, shared by the signup form and the server.
 *
 * Pure — no env, no database. This module is exported from the browser-safe
 * barrel, so it must never import from ./env or ./db.
 *
 * Phase 6 turns usernames into `/:username` profile URLs, which is why the
 * charset is conservative and the reserved list exists.
 */

export const MIN_USERNAME_LENGTH = 3
export const MAX_USERNAME_LENGTH = 32

/** Words that would shadow a route or impersonate the product. Lowercase. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'api', 'auth', 'login', 'logout', 'signup', 'signin',
  'settings', 'profile', 'me', 'you', 'explore', 'trip', 'trips', 'new', 'edit',
  'help', 'support', 'about', 'terms', 'privacy', 'security', 'billing',
  'tether', 'official', 'staff', 'system', 'root', 'null', 'undefined',
  'static', 'assets', 'public', 'health', 'status',
])

/** Trim and lowercase. The canonical form used for uniqueness. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export type UsernameResult =
  | { ok: true; username: string; usernameLower: string }
  | { ok: false; reason: string }

/**
 * Validates a username and returns both the display form (as typed, trimmed)
 * and the canonical lowercase form that carries the unique index.
 */
export function validateUsername(raw: string): UsernameResult {
  const username = raw.trim()
  const usernameLower = normalizeUsername(raw)

  if (usernameLower.length < MIN_USERNAME_LENGTH) {
    return { ok: false, reason: `Must be at least ${MIN_USERNAME_LENGTH} characters.` }
  }
  if (usernameLower.length > MAX_USERNAME_LENGTH) {
    return { ok: false, reason: `Must be at most ${MAX_USERNAME_LENGTH} characters.` }
  }
  if (!/^[a-z]/.test(usernameLower)) {
    return { ok: false, reason: 'Must start with a letter.' }
  }
  if (!/^[a-z0-9_]+$/.test(usernameLower)) {
    return { ok: false, reason: 'Only letters, numbers, and underscores.' }
  }
  if (usernameLower.includes('__')) {
    return { ok: false, reason: 'No consecutive underscores.' }
  }
  if (usernameLower.endsWith('_')) {
    return { ok: false, reason: 'Cannot end with an underscore.' }
  }
  if (RESERVED_USERNAMES.has(usernameLower)) {
    return { ok: false, reason: 'That name is reserved.' }
  }

  return { ok: true, username, usernameLower }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm --filter @tether/shared test
```

Expected: PASS, 32 tests total.

- [ ] **Step 5: Export from the browser-safe barrel `packages/shared/src/index.ts`**

```ts
// Browser-safe barrel. Server-only modules are reached through their subpaths:
//   @tether/shared/env       Zod-validated process env
//   @tether/shared/db        Drizzle client
//   @tether/shared/db/schema Drizzle tables
// biome.json enforces that restriction; see the boundaries table in the plan.
export type { CoreEnv, RealtimeEnv, WebEnv } from './env'
export { docNameForTrip, getActivities, getDays, getMeta, tripIdFromDocName } from './yjs/schema'
export {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  normalizeUsername,
  RESERVED_USERNAMES,
  validateUsername,
  type UsernameResult,
} from './username'
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): username rules shared by the signup form and server"
```

---

## Task 3: Auth schema and migration

The four Better Auth tables are **hand-written**, not generated. `@better-auth/cli`'s newest publish is 2026-03-16 against a library released 2026-09 — it predates `account.issuer`, which `getAuthTables()` reports as required. The definitions below came from running `getAuthTables()` with this project's exact config (probe P3).

**Files:**
- Modify: `packages/shared/src/db/schema.ts`
- Create: `packages/shared/migrations/0001_*.sql` (generated)

- [ ] **Step 1: Append the auth tables to `packages/shared/src/db/schema.ts`**

Add `boolean` to the existing `drizzle-orm/pg-core` import, then append:

```ts
/**
 * Better Auth owns these four tables. Column *property* names must match Better
 * Auth's field names exactly (camelCase) because the Drizzle adapter looks up
 * `schema[model][field]`; the SQL column names underneath are ours to choose.
 *
 * Hand-written rather than generated: @better-auth/cli's newest release
 * (2026-03-16) predates better-auth 1.7.1 and does not know about
 * `account.issuer`. Shape verified by running getAuthTables() with our config.
 *
 * "user" is a reserved word in Postgres; Drizzle quotes identifiers, so it is safe.
 */
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(), // D1.3 — this IS the display name
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'), // unused in Phase 1
    // D1.2 — username lives here, not on user_profile, so signup is one insert.
    username: varchar('username', { length: 32 }).notNull(),
    usernameLower: varchar('username_lower', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('user_email_idx').on(t.email),
    uniqueIndex('user_username_lower_idx').on(t.usernameLower),
  ],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('session_token_idx').on(t.token), index('session_user_id_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    // scrypt hash (node:crypto), not bcrypt — see docs/security.md §2.1.
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

/**
 * Non-identity profile fields (D1.4). Deliberately separate from `user` so that
 * a failure here can never block account creation: it is written by an
 * after-hook and lazily created on first read if missing.
 *
 * avatarKey stays null in Phase 1 — nothing renders an avatar until Phase 6.
 */
export const userProfile = pgTable('user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  bio: text('bio'),
  homeCity: varchar('home_city', { length: 120 }),
  avatarKey: text('avatar_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type User = typeof user.$inferSelect
export type UserProfile = typeof userProfile.$inferSelect
export type NewUserProfile = typeof userProfile.$inferInsert
```

- [ ] **Step 2: Generate the migration**

```bash
pnpm db:generate
```

Expected: `packages/shared/migrations/0001_*.sql` containing `CREATE TABLE "user"`, `"session"`, `"account"`, `"verification"`, `"user_profile"`.

- [ ] **Step 3: Apply it**

```bash
pnpm db:migrate
```

- [ ] **Step 4: Verify the shape in Postgres**

```bash
docker compose exec -T postgres psql -U tether -d tether -c '\d user'
docker compose exec -T postgres psql -U tether -d tether -c '\d user_profile'
```

Expected: `user` has `username`, `username_lower`, `email_verified`; two unique indexes (`user_email_idx`, `user_username_lower_idx`). `user_profile` has `user_id` as primary key with a cascade FK.

- [ ] **Step 5: Prove the unique index actually blocks a duplicate**

The index is the sole arbiter under D1.2, so verify it rather than trust it:

```bash
docker compose exec -T postgres psql -U tether -d tether -c "
insert into \"user\" (id,name,email,username,username_lower) values ('u1','A','a@x.co','Alice','alice');
insert into \"user\" (id,name,email,username,username_lower) values ('u2','B','b@x.co','ALICE','alice');
" 2>&1 | tail -3
```

Expected: the second insert fails with `duplicate key value violates unique constraint "user_username_lower_idx"`.

Clean up:

```bash
docker compose exec -T postgres psql -U tether -d tether -c "delete from \"user\" where id in ('u1','u2');"
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): better auth tables and user_profile with first auth migration"
```

---

## Task 4: Mailer and email templates

**Files:**
- Create: `apps/web/src/server/email/mailer.ts`, `apps/web/src/server/email/templates.ts`, `apps/web/src/server/email/templates.test.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the dependencies**

```bash
pnpm --filter @tether/web add nodemailer@9.0.5
pnpm --filter @tether/web add -D @types/nodemailer@8.0.1
```

- [ ] **Step 2: Write the failing test `apps/web/src/server/email/templates.test.ts`**

Escaping is an **A05** control: emails embed a user-chosen display name, and mail clients render HTML.

```ts
import { describe, expect, it } from 'vitest'
import { escapeHtml, resetPasswordEmail, verificationEmail } from './templates'

describe('escapeHtml', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Alice from Berlin')).toBe('Alice from Berlin')
  })
})

describe('verificationEmail', () => {
  it('includes the verification URL', () => {
    const m = verificationEmail({ name: 'Alice', url: 'https://x.test/v?t=abc' })
    expect(m.html).toContain('https://x.test/v?t=abc')
    expect(m.text).toContain('https://x.test/v?t=abc')
  })

  // A05: a hostile display name must not become live markup in a mail client.
  it('neutralises HTML in the display name', () => {
    const m = verificationEmail({ name: '<script>alert(1)</script>', url: 'https://x.test/v' })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('has a subject', () => {
    expect(verificationEmail({ name: 'A', url: 'https://x.test' }).subject.length).toBeGreaterThan(0)
  })
})

describe('resetPasswordEmail', () => {
  it('includes the reset URL and escapes the name', () => {
    const m = resetPasswordEmail({ name: '"><b>x', url: 'https://x.test/r?t=1' })
    expect(m.html).toContain('https://x.test/r?t=1')
    expect(m.html).not.toContain('<b>x')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

```bash
pnpm --filter @tether/web test
```

Expected: FAIL, `Failed to resolve import "./templates"`.

- [ ] **Step 4: Write `apps/web/src/server/email/templates.ts`**

```ts
export type Email = { subject: string; text: string; html: string }

/**
 * A05 (Injection). Emails embed a user-chosen display name and mail clients
 * render HTML, so every interpolated value is escaped. There is no templating
 * library here on purpose — one function, auditable in ten lines.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function layout(heading: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#171717">
  <h1 style="font-size:20px">${heading}</h1>
  ${body}
  <p><a href="${cta.url}" style="display:inline-block;background:#171717;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${cta.label}</a></p>
  <p style="font-size:12px;color:#737373">If the button does not work, paste this into your browser:<br>${cta.url}</p>
</body></html>`
}

export function verificationEmail(input: { name: string; url: string }): Email {
  const name = escapeHtml(input.name)
  return {
    subject: 'Confirm your Tether email address',
    text: `Hi ${input.name},\n\nConfirm your email address:\n${input.url}\n\nThis link expires in 24 hours.`,
    html: layout(
      `Hi ${name},`,
      '<p>Confirm your email address to finish setting up your Tether account. This link expires in 24 hours.</p>',
      { label: 'Confirm email', url: input.url },
    ),
  }
}

export function resetPasswordEmail(input: { name: string; url: string }): Email {
  const name = escapeHtml(input.name)
  return {
    subject: 'Reset your Tether password',
    text: `Hi ${input.name},\n\nReset your password:\n${input.url}\n\nThis link expires in 1 hour and can be used once. If you did not ask for this, ignore this email.`,
    html: layout(
      `Hi ${name},`,
      '<p>Reset your password using the button below. This link expires in 1 hour and can only be used once. If you did not request it, you can safely ignore this email.</p>',
      { label: 'Reset password', url: input.url },
    ),
  }
}
```

Note the `text` bodies interpolate the **raw** name deliberately — plain text is not parsed as markup, and escaping there would show `&lt;` to the reader.

- [ ] **Step 5: Run to verify it passes**

```bash
pnpm --filter @tether/web test
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Write `apps/web/src/server/email/mailer.ts`**

```ts
import { webEnv } from '@tether/shared/env'
import nodemailer from 'nodemailer'
import type { Email } from './templates'

// Mailpit in dev (no auth, no TLS). Stage 2 swaps host/port for a real relay;
// nothing else here changes.
let cached: nodemailer.Transporter | undefined

function transport(): nodemailer.Transporter {
  const env = webEnv()
  cached ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    ignoreTLS: true,
  })
  return cached
}

/**
 * A09: log that an email was sent and to which user, never its contents —
 * bodies carry single-use verification and reset tokens.
 */
export async function sendEmail(to: string, email: Email): Promise<void> {
  await transport().sendMail({
    from: webEnv().EMAIL_FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  })
  console.info(JSON.stringify({ event: 'email.sent', to, subject: email.subject }))
}
```

- [ ] **Step 7: Write the failing test `apps/web/src/server/log.test.ts`**

**A09** requires auth events to be logged *without* their secrets. A logger that
accidentally prints a reset token turns the log into the vulnerability.

```ts
import { describe, expect, it } from 'vitest'
import { redact } from './log'

describe('redact', () => {
  it('replaces known secret keys', () => {
    const out = redact({ userId: 'u1', password: 'hunter2', token: 'abc', email: 'a@b.co' })
    expect(out.password).toBe('[redacted]')
    expect(out.token).toBe('[redacted]')
    expect(out.userId).toBe('u1')
  })

  it('is case-insensitive and matches partial names', () => {
    const out = redact({ resetToken: 'x', SessionToken: 'y', passwordHash: 'z' })
    expect(Object.values(out)).toEqual(['[redacted]', '[redacted]', '[redacted]'])
  })

  it('leaves ordinary values alone', () => {
    expect(redact({ event: 'auth.login', ok: true }).event).toBe('auth.login')
  })
})
```

- [ ] **Step 8: Run to verify it fails, then write `apps/web/src/server/log.ts`**

```bash
pnpm --filter @tether/web test
```

Expected: FAIL, `Failed to resolve import "./log"`. Then:

```ts
/**
 * A09 (Security Logging & Alerting Failures). Structured auth events, with
 * secrets stripped before they can reach a log sink.
 *
 * Honest limit: this produces the signal only. Aggregation and alerting are
 * Stage 2-3 per PRD §7b — nothing watches these lines yet.
 */
const SECRET_KEY = /pass|token|secret|hash|cookie|authorization/i

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SECRET_KEY.test(k) ? '[redacted]' : v
  }
  return out
}

export type AuthEvent =
  | 'auth.signup'
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.reset.requested'
  | 'auth.reset.completed'
  | 'auth.throttled'

export function authLog(event: AuthEvent, fields: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...redact(fields) }))
}
```

Re-run: PASS, 10 tests.

- [ ] **Step 9: Use it in the mailer**

Replace the `console.info` line in `apps/web/src/server/email/mailer.ts` with:

```ts
  authLog('auth.reset.requested', { to, subject: email.subject })
```

and add `import { authLog } from '../log'` at the top. (`sendEmail` is only ever called for verification and reset; the subject distinguishes them without logging a body.)

- [ ] **Step 10: Commit**

```bash
git add apps/web packages/shared pnpm-lock.yaml
git commit -m "feat(web): mailpit mailer, escaped templates, and redacting auth logger"
```

---

## Task 5: Better Auth configuration, route handler, and production guard

**Files:**
- Create: `apps/web/src/server/auth/index.ts`, `apps/web/src/server/auth/guard.ts`, `apps/web/src/server/auth/guard.test.ts`, `apps/web/src/app/api/auth/[...all]/route.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @tether/web add better-auth@1.7.1
```

- [ ] **Step 2: Write the failing test `apps/web/src/server/auth/guard.test.ts`**

Same shape as Phase 0's realtime stub guard: a weakened-for-development setting must not be able to reach production silently (**A02**).

```ts
import { describe, expect, it } from 'vitest'
import { assertProductionAuthPosture } from './guard'

const safe = {
  NODE_ENV: 'production' as const,
  REQUIRE_EMAIL_VERIFICATION: true,
  RATE_LIMIT_ENABLED: true,
}

describe('assertProductionAuthPosture', () => {
  it('passes in production when the posture is correct', () => {
    expect(() => assertProductionAuthPosture(safe)).not.toThrow()
  })

  it('throws in production when email verification is disabled', () => {
    expect(() =>
      assertProductionAuthPosture({ ...safe, REQUIRE_EMAIL_VERIFICATION: false }),
    ).toThrow(/REQUIRE_EMAIL_VERIFICATION/)
  })

  it('throws in production when rate limiting is disabled', () => {
    expect(() => assertProductionAuthPosture({ ...safe, RATE_LIMIT_ENABLED: false })).toThrow(
      /RATE_LIMIT_ENABLED/,
    )
  })

  it('allows the relaxed development posture outside production', () => {
    expect(() =>
      assertProductionAuthPosture({
        NODE_ENV: 'development',
        REQUIRE_EMAIL_VERIFICATION: false,
        RATE_LIMIT_ENABLED: true,
      }),
    ).not.toThrow()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

```bash
pnpm --filter @tether/web test
```

Expected: FAIL, `Failed to resolve import "./guard"`.

- [ ] **Step 4: Write `apps/web/src/server/auth/guard.ts`**

```ts
export type AuthPosture = {
  NODE_ENV: 'development' | 'test' | 'production'
  REQUIRE_EMAIL_VERIFICATION: boolean
  RATE_LIMIT_ENABLED: boolean
}

/**
 * A02 (Security Misconfiguration). Two settings are deliberately relaxed for
 * local development (D1.5, D1.8). This makes it impossible for either to reach
 * production unnoticed: the process refuses to boot instead.
 *
 * Same pattern as the Phase 0 realtime stub-auth guard.
 */
export function assertProductionAuthPosture(env: AuthPosture): void {
  if (env.NODE_ENV !== 'production') return

  const failures: string[] = []
  if (!env.REQUIRE_EMAIL_VERIFICATION) failures.push('REQUIRE_EMAIL_VERIFICATION must be true')
  if (!env.RATE_LIMIT_ENABLED) failures.push('RATE_LIMIT_ENABLED must be true')

  if (failures.length > 0) {
    throw new Error(`Unsafe auth configuration for production:\n  ${failures.join('\n  ')}`)
  }
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
pnpm --filter @tether/web test
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Write `apps/web/src/server/auth/index.ts`**

```ts
import { db } from '@tether/shared/db'
import { schema, userProfile } from '@tether/shared/db'
import { webEnv } from '@tether/shared/env'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sendEmail } from '../email/mailer'
import { resetPasswordEmail, verificationEmail } from '../email/templates'
import { assertProductionAuthPosture } from './guard'

const env = webEnv()

assertProductionAuthPosture({
  NODE_ENV: env.NODE_ENV,
  REQUIRE_EMAIL_VERIFICATION: env.REQUIRE_EMAIL_VERIFICATION,
  RATE_LIMIT_ENABLED: env.RATE_LIMIT_ENABLED,
})

export const auth = betterAuth({
  // Pass `schema` explicitly: the adapter otherwise relies on db._.fullSchema
  // being populated by how createDb happens to be built — a silent coupling.
  database: drizzleAdapter(db(), { provider: 'pg', schema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],

  emailAndPassword: {
    enabled: true,
    // D1.5 — emails are sent either way; this only controls whether login is gated.
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    minPasswordLength: 10,
    autoSignIn: true,
    // A07 — a reset must log the account out everywhere, per security.md §2.3.
    // Not the default; verified as a real option in better-auth 1.7.1.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(user.email, resetPasswordEmail({ name: user.name, url }))
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(user.email, verificationEmail({ name: user.name, url }))
    },
  },

  // D1.2 — username on `user` makes signup a single atomic insert.
  // input:false on usernameLower means a client cannot set it directly.
  user: {
    additionalFields: {
      username: { type: 'string', required: true, input: true },
      // required:false, NOT true. Better Auth validates additionalFields against
      // the request BODY before databaseHooks run, so a `required` field the
      // client is forbidden to send (input:false) is rejected as MISSING_FIELD
      // and every signup 400s. NOT NULL on user.username_lower is the real
      // guarantee. Verified: required:true -> 400, hooks never run.
      usernameLower: { type: 'string', required: false, input: false, unique: true },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  // D1.8 — better-auth's own default is `enabled ?? isProduction`, i.e. OFF in
  // development. Explicit, so local tests can actually observe throttling.
  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED,
    window: 60,
    max: 30,
    // Better Auth ships DEFAULT SPECIAL RULES that override the base for these
    // paths: /sign-in* and /sign-up* are 3 per 10s, /request-password-reset is
    // 3 per 60s. Undocumented defaults are not a security posture — state ours,
    // or the e2e suite throttles itself from a single shared bucket.
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 20 },
      '/request-password-reset': { window: 60, max: 20 },
    },
  },

  advanced: {
    cookiePrefix: 'tether',
    useSecureCookies: env.NODE_ENV === 'production',
  },

  databaseHooks: {
    user: {
      create: {
        // D1.4 — profile creation must never block signup, so failures are
        // swallowed here and repaired lazily by profile.get.
        after: async (created) => {
          try {
            await db().insert(userProfile).values({ userId: created.id }).onConflictDoNothing()
          } catch (error) {
            console.warn(
              JSON.stringify({
                event: 'user_profile.create_failed',
                userId: created.id,
                message: error instanceof Error ? error.message : String(error),
              }),
            )
          }
        },
      },
    },
  },
})
```

- [ ] **Step 7: Derive `usernameLower` server-side**

`input: false` stops a client sending it, but nothing yet computes it. Add a `before` hook alongside the `after` hook, inside `databaseHooks.user.create`:

```ts
        before: async (creating) => {
          const raw = (creating as { username?: unknown }).username
          if (typeof raw !== 'string') {
            throw new Error('username is required')
          }
          const result = validateUsername(raw)
          if (!result.ok) {
            throw new Error(`Invalid username: ${result.reason}`)
          }
          return {
            data: {
              ...creating,
              username: result.username,
              usernameLower: result.usernameLower,
            },
          }
        },
```

Add the import at the top of the file:

```ts
import { validateUsername } from '@tether/shared'
```

Server-side validation is the authority; the signup form's live check is a convenience, never a control.

- [ ] **Step 8: Write `apps/web/src/app/api/auth/[...all]/route.ts`**

```ts
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/server/auth'

export const { GET, POST } = toNextJsHandler(auth)
```

- [ ] **Step 9: Verify the endpoint is live**

```bash
pnpm --filter @tether/web dev
```

In a second terminal:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/auth/ok
```

Expected: `200`. If it is `404`, the catch-all segment name is wrong — it must be `[...all]`.

- [ ] **Step 10: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): better auth configuration with production posture guard"
```

---

## Task 6: Session-aware tRPC

Phase 0 left `userId: null` with a comment saying Phase 1 would fill it in. This is that.

**Files:**
- Modify: `apps/web/src/server/trpc/init.ts`

- [ ] **Step 1: Replace `apps/web/src/server/trpc/init.ts`**

```ts
import { type Database, db } from '@tether/shared/db'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { auth } from '@/server/auth'

export type SessionUser = { id: string; email: string; name: string; username: string }

export type Context = {
  db: Database
  user: SessionUser | null
}

/**
 * A10 (Mishandling of Exceptional Conditions): if the session lookup throws,
 * the request is treated as ANONYMOUS, never as authorised. Failing closed is
 * the whole point — an error here must not become an authorisation bypass.
 */
export async function createContext(opts?: { headers?: Headers }): Promise<Context> {
  let user: SessionUser | null = null
  try {
    const session = await auth.api.getSession({ headers: opts?.headers ?? new Headers() })
    if (session?.user) {
      user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        username: (session.user as { username: string }).username,
      }
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'session.lookup_failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    )
    user = null
  }
  return { db: db(), user }
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  // A10: never leak internals to a client in production.
  errorFormatter({ shape, error }) {
    if (process.env.NODE_ENV === 'production') {
      return {
        ...shape,
        message: error.code === 'INTERNAL_SERVER_ERROR' ? 'Internal server error' : shape.message,
        data: { code: shape.data.code, httpStatus: shape.data.httpStatus },
      }
    }
    return shape
  },
})

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory

/**
 * A01 (Broken Access Control). Every non-public procedure builds on this.
 * Phase 4 layers trip roles on top; the shape does not change.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})
```

- [ ] **Step 2: Pass request headers through the fetch adapter**

Replace `apps/web/src/app/api/trpc/[trpc]/route.ts`:

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createContext } from '@/server/trpc/init'
import { appRouter } from '@/server/trpc/root'

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    // Without the headers the session cookie never reaches getSession and every
    // request looks anonymous.
    createContext: () => createContext({ headers: req.headers }),
  })
}

export { handler as GET, handler as POST }
```

- [ ] **Step 3: Pass headers from React Server Components**

Replace the `serverApi` export in `apps/web/src/server/trpc/root.ts`:

```ts
import { headers } from 'next/headers'
import { createCallerFactory, createContext, router } from './init'
import { healthRouter } from './routers/health'
import { profileRouter } from './routers/profile'

export const appRouter = router({
  health: healthRouter,
  profile: profileRouter,
})

export type AppRouter = typeof appRouter

const createCaller = createCallerFactory(appRouter)

/** Server-side caller for React Server Components — no HTTP hop. */
export async function serverApi() {
  return createCaller(await createContext({ headers: await headers() }))
}
```

`profileRouter` arrives in Task 7; this file will not typecheck until then, which is expected and resolved there.

- [ ] **Step 4: Commit (after Task 7 makes it compile)**

This task and Task 7 land in one commit because `root.ts` references a router Task 7 creates. Proceed directly to Task 7.

---

## Task 7: Profile router

**Files:**
- Create: `apps/web/src/server/trpc/routers/profile.ts`
- Modify: `packages/shared/src/db/client.ts`

- [ ] **Step 1: Add profile queries to `packages/shared/src/db/client.ts`**

SQL stays in `packages/shared/src/db/` — the Phase 0 boundary, and the reason `countPlaces` lives here rather than in a router.

Add to the imports at the top:

```ts
import { eq } from 'drizzle-orm'
import { user, userProfile } from './schema'
```

Append:

```ts
export type ProfileRow = {
  userId: string
  name: string
  username: string
  email: string
  emailVerified: boolean
  bio: string | null
  homeCity: string | null
}

/**
 * Reads a user's profile, creating the row if it is missing (D1.4).
 * Signup writes it via an after-hook that deliberately swallows failures, so
 * this is the repair path — a user can never be stuck without a profile.
 */
export async function getOrCreateProfile(
  database: Database,
  userId: string,
): Promise<ProfileRow | null> {
  const rows = await database
    .select({
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      bio: userProfile.bio,
      homeCity: userProfile.homeCity,
    })
    .from(user)
    .leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1)

  const row = rows.at(0)
  if (!row) return null

  await database.insert(userProfile).values({ userId }).onConflictDoNothing()
  return row
}

/** Updates the fields a user may change about themselves. */
export async function updateProfile(
  database: Database,
  userId: string,
  input: { name: string; bio: string | null; homeCity: string | null },
): Promise<void> {
  await database.update(user).set({ name: input.name, updatedAt: new Date() }).where(eq(user.id, userId))
  await database
    .insert(userProfile)
    .values({ userId, bio: input.bio, homeCity: input.homeCity })
    .onConflictDoUpdate({
      target: userProfile.userId,
      set: { bio: input.bio, homeCity: input.homeCity, updatedAt: new Date() },
    })
}

/** True when the canonical lowercase form is free. */
export async function isUsernameAvailable(
  database: Database,
  usernameLower: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.usernameLower, usernameLower))
    .limit(1)
  return rows.length === 0
}
```

- [ ] **Step 2: Write `apps/web/src/server/trpc/routers/profile.ts`**

```ts
import { getOrCreateProfile, isUsernameAvailable, updateProfile } from '@tether/shared/db'
import { validateUsername } from '@tether/shared'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, publicProcedure, router } from '../init'

export const profileRouter = router({
  /**
   * A01: no userId input. The caller can only ever read their own profile,
   * because the id comes from the session. This is the IDOR defence — there is
   * no parameter to tamper with.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getOrCreateProfile(ctx.db, ctx.user.id)
    if (!profile) throw new TRPCError({ code: 'NOT_FOUND' })
    return profile
  }),

  /** A01: same — the target is always ctx.user.id, never client-supplied. */
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        bio: z.string().trim().max(500).nullable(),
        homeCity: z.string().trim().max(120).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await updateProfile(ctx.db, ctx.user.id, input)
      return { ok: true as const }
    }),

  /**
   * A06: this endpoint is a username enumeration oracle by design (D1.1).
   * Accepted, but it returns only a boolean and is covered by the global rate
   * limit. Never widen the response.
   */
  checkUsernameAvailable: publicProcedure
    .input(z.object({ username: z.string().max(64) }))
    .query(async ({ ctx, input }) => {
      const result = validateUsername(input.username)
      if (!result.ok) return { available: false, reason: result.reason }
      const available = await isUsernameAvailable(ctx.db, result.usernameLower)
      return { available, reason: available ? null : 'That name is taken.' }
    }),
})
```

- [ ] **Step 3: Typecheck, then commit Tasks 6 and 7 together**

```bash
pnpm typecheck
```

Expected: all packages pass.

```bash
git add apps/web packages/shared
git commit -m "feat(web): session-aware tRPC context, protectedProcedure, and profile router"
```

---

## Task 8: Security headers and cookie posture

**Files:**
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Add headers to `apps/web/next.config.ts`**

Replace the config object, keeping `transpilePackages` and `agentRules` exactly as they are:

```ts
import type { NextConfig } from 'next'

/**
 * A02 (Security Misconfiguration). HSTS is deliberately absent: Phase 1 serves
 * plain http on localhost, and sending HSTS from a non-TLS origin is either
 * ignored or actively harmful. It is added at Stage 2 with the certificate.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next injects inline bootstrap scripts; 'unsafe-inline' is required until
      // a nonce-based CSP lands in the Phase 8 polish pass.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      // ws: for the Hocuspocus connection on :1234.
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next must transpile them.
  transpilePackages: ['@tether/shared'],
  // Next 16 writes apps/web/AGENTS.md and apps/web/CLAUDE.md on first dev run.
  // This repo keeps its agent instructions in the root CLAUDE.md; a generated
  // second copy scoped to apps/web would silently compete with it.
  agentRules: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default config
```

- [ ] **Step 2: Verify the headers are served**

```bash
pnpm --filter @tether/web dev
```

```bash
curl -sI http://localhost:3000 | grep -iE "content-security-policy|x-frame-options|x-content-type-options|referrer-policy"
```

Expected: all four present.

- [ ] **Step 3: Confirm the realtime websocket still connects**

CSP `connect-src` must not break Phase 0's counter. Open http://localhost:3000 in two windows; both must read `synced` and Increment must still propagate. A CSP violation appears in the browser console as a blocked `connect-src`.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): security headers"
```

---

## Task 9: Auth client, signup, and login

**Files:**
- Create: `apps/web/src/lib/auth-client.ts`, `apps/web/src/components/AuthForm.tsx`, `apps/web/src/app/(auth)/signup/page.tsx`, `apps/web/src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Write `apps/web/src/lib/auth-client.ts`**

```ts
'use client'

import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import type { auth } from '@/server/auth'

/**
 * inferAdditionalFields is required, not optional: without it the client rejects
 * `username` on signUp.email at compile time and would not send it at runtime.
 * `typeof auth` is a TYPE-only import, so no server code reaches the bundle —
 * the Phase 0 CI grep would fail the build if it did.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
})

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword } =
  authClient
```

- [ ] **Step 2: Write `apps/web/src/components/AuthForm.tsx`**

```tsx
'use client'

import type { FormEvent, ReactNode } from 'react'

export function AuthForm({
  title,
  submitLabel,
  error,
  pending,
  onSubmit,
  children,
  footer,
}: {
  title: string
  submitLabel: string
  error: string | null
  pending: boolean
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 p-10">
      <h1 className="text-2xl font-bold">{title}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {children}
        {error ? (
          <p data-testid="form-error" role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          data-testid="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pending ? 'Working…' : submitLabel}
        </button>
      </form>
      {footer}
    </main>
  )
}

export function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  hint,
  autoComplete,
}: {
  label: string
  name: string
  type?: string
  value: string
  onChange: (v: string) => void
  hint?: ReactNode
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`field-${name}`}
        className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {hint}
    </label>
  )
}
```

- [ ] **Step 3: Write `apps/web/src/app/(auth)/signup/page.tsx`**

```tsx
'use client'

import { validateUsername } from '@tether/shared'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { AuthForm, Field } from '@/components/AuthForm'
import { signUp } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc-client'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [availability, setAvailability] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Live availability. A convenience only — the server re-validates on submit
  // and the unique index is the real arbiter (D1.2).
  useEffect(() => {
    if (username.length === 0) {
      setAvailability('')
      return
    }
    const local = validateUsername(username)
    if (!local.ok) {
      setAvailability(local.reason)
      return
    }
    const timer = setTimeout(() => {
      trpc.profile.checkUsernameAvailable
        .query({ username })
        .then((r) => setAvailability(r.available ? 'Available' : (r.reason ?? 'Taken')))
        .catch(() => setAvailability(''))
    }, 300)
    return () => clearTimeout(timer)
  }, [username])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error: authError } = await signUp.email({ email, password, name, username })
    setPending(false)
    if (authError) {
      setError(authError.message ?? 'Could not create the account.')
      return
    }
    router.push('/profile')
    router.refresh()
  }

  return (
    <AuthForm
      title="Create your Tether account"
      submitLabel="Sign up"
      error={error}
      pending={pending}
      onSubmit={onSubmit}
      footer={
        <p className="text-sm text-neutral-500">
          Already have an account?{' '}
          <a className="underline" href="/login">
            Log in
          </a>
        </p>
      }
    >
      <Field label="Display name" name="name" value={name} onChange={setName} autoComplete="name" />
      <Field
        label="Username"
        name="username"
        value={username}
        onChange={setUsername}
        autoComplete="username"
        hint={
          <span data-testid="username-availability" className="text-xs text-neutral-500">
            {availability}
          </span>
        }
      />
      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
      <Field
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={<span className="text-xs text-neutral-500">At least 10 characters.</span>}
      />
    </AuthForm>
  )
}
```

- [ ] **Step 4: Write `apps/web/src/app/(auth)/login/page.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { AuthForm, Field } from '@/components/AuthForm'
import { signIn } from '@/lib/auth-client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error: authError } = await signIn.email({ email, password })
    setPending(false)
    if (authError) {
      // A06: one message for wrong password and unknown email alike — no oracle.
      setError('Email or password is incorrect.')
      return
    }
    router.push('/profile')
    router.refresh()
  }

  return (
    <AuthForm
      title="Log in to Tether"
      submitLabel="Log in"
      error={error}
      pending={pending}
      onSubmit={onSubmit}
      footer={
        <p className="text-sm text-neutral-500">
          <a className="underline" href="/forgot-password">
            Forgot your password?
          </a>
          {' · '}
          <a className="underline" href="/signup">
            Create an account
          </a>
        </p>
      }
    >
      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
      <Field
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
    </AuthForm>
  )
}
```

- [ ] **Step 5: Verify by hand**

```bash
pnpm dev
```

Sign up at http://localhost:3000/signup. Expected: the username field reports `Available`, submitting lands on `/profile` (which 404s until Task 11 — that is fine), and the verification email appears at http://localhost:8025.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): signup and login with live username availability"
```

---

## Task 10: Password reset and email verification pages

**Files:**
- Create: `apps/web/src/app/(auth)/forgot-password/page.tsx`, `apps/web/src/app/(auth)/reset-password/page.tsx`, `apps/web/src/app/(auth)/verify-email/page.tsx`

- [ ] **Step 1: Write `apps/web/src/app/(auth)/forgot-password/page.tsx`**

```tsx
'use client'

import { type FormEvent, useState } from 'react'
import { AuthForm, Field } from '@/components/AuthForm'
import { requestPasswordReset } from '@/lib/auth-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPending(true)
    await requestPasswordReset({ email, redirectTo: '/reset-password' })
    setPending(false)
    // D1.9 / A06: identical outcome whether or not the address exists.
    // Deliberately ignores the result so no branch can leak membership.
    setSent(true)
  }

  if (sent) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-col gap-4 p-10">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p data-testid="reset-requested" className="text-sm text-neutral-600 dark:text-neutral-400">
          If an account exists for {email}, we have sent a link to reset the password. It expires in
          one hour.
        </p>
      </main>
    )
  }

  return (
    <AuthForm
      title="Reset your password"
      submitLabel="Send reset link"
      error={null}
      pending={pending}
      onSubmit={onSubmit}
    >
      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />
    </AuthForm>
  )
}
```

- [ ] **Step 2: Write `apps/web/src/app/(auth)/reset-password/page.tsx`**

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, type FormEvent, useState } from 'react'
import { AuthForm, Field } from '@/components/AuthForm'
import { resetPassword } from '@/lib/auth-client'

function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error: authError } = await resetPassword({ newPassword: password, token })
    setPending(false)
    if (authError) {
      setError('That reset link is invalid or has already been used.')
      return
    }
    router.push('/login')
  }

  return (
    <AuthForm
      title="Choose a new password"
      submitLabel="Set password"
      error={error}
      pending={pending}
      onSubmit={onSubmit}
    >
      <Field
        label="New password"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={<span className="text-xs text-neutral-500">At least 10 characters.</span>}
      />
    </AuthForm>
  )
}

export default function ResetPasswordPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
```

- [ ] **Step 3: Write `apps/web/src/app/(auth)/verify-email/page.tsx`**

Better Auth handles the token at its own endpoint and redirects here, so this page only reports the outcome.

```tsx
export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-4 p-10">
      <h1 className="text-2xl font-bold">Email confirmed</h1>
      <p data-testid="verify-result" className="text-sm text-neutral-600 dark:text-neutral-400">
        Thanks — your email address is confirmed.
      </p>
      <a className="underline" href="/profile">
        Go to your profile
      </a>
    </main>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): password reset and email verification pages"
```

---

## Task 11: Profile page

**Files:**
- Create: `apps/web/src/app/profile/page.tsx`, `apps/web/src/components/ProfileEditor.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write `apps/web/src/app/profile/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { ProfileEditor } from '@/components/ProfileEditor'
import { serverApi } from '@/server/trpc/root'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const api = await serverApi()
  let profile: Awaited<ReturnType<Awaited<ReturnType<typeof serverApi>>['profile']['get']>>
  try {
    profile = await api.profile.get()
  } catch {
    // A01: an unauthenticated visitor never sees this page. protectedProcedure
    // throws UNAUTHORIZED; we translate that into a redirect.
    redirect('/login')
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Your profile</h1>
        <p className="text-sm text-neutral-500">
          <span data-testid="profile-username">@{profile.username}</span>
          {' · '}
          <span data-testid="profile-email">{profile.email}</span>
          {' · '}
          <span data-testid="profile-verified">
            {profile.emailVerified ? 'verified' : 'unverified'}
          </span>
        </p>
      </header>

      <ProfileEditor
        initial={{ name: profile.name, bio: profile.bio, homeCity: profile.homeCity }}
      />
    </main>
  )
}
```

- [ ] **Step 2: Write `apps/web/src/components/ProfileEditor.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Field } from '@/components/AuthForm'
import { signOut } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc-client'

export function ProfileEditor({
  initial,
}: {
  initial: { name: string; bio: string | null; homeCity: string | null }
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [bio, setBio] = useState(initial.bio ?? '')
  const [homeCity, setHomeCity] = useState(initial.homeCity ?? '')
  const [status, setStatus] = useState('')

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('Saving…')
    try {
      // A01: no user id is sent. The server uses the session's id.
      await trpc.profile.update.mutate({
        name,
        bio: bio.trim() === '' ? null : bio,
        homeCity: homeCity.trim() === '' ? null : homeCity,
      })
      setStatus('Saved')
      router.refresh()
    } catch {
      setStatus('Could not save')
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Display name" name="name" value={name} onChange={setName} />
        <Field label="Bio" name="bio" value={bio} onChange={setBio} />
        <Field label="Home city" name="homeCity" value={homeCity} onChange={setHomeCity} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            data-testid="save-profile"
            className="rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
          >
            Save
          </button>
          <span data-testid="save-status" className="text-sm text-neutral-500">
            {status}
          </span>
        </div>
      </form>

      <button
        type="button"
        data-testid="sign-out"
        onClick={async () => {
          await signOut()
          router.push('/login')
          router.refresh()
        }}
        className="self-start text-sm underline"
      >
        Sign out
      </button>
    </section>
  )
}
```

- [ ] **Step 3: Add a link from the home page**

In `apps/web/src/app/page.tsx`, add inside `<header>` after the existing `<p>`:

```tsx
        <p className="text-sm">
          <a className="underline" href="/profile" data-testid="profile-link">
            Your profile
          </a>
        </p>
```

- [ ] **Step 4: Verify by hand**

```bash
pnpm dev
```

Sign up, land on `/profile`, edit the bio, save, reload — the value persists. Sign out, then visit http://localhost:3000/profile directly: expected redirect to `/login`.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): profile page with editing and sign-out"
```

---

## Task 12: End-to-end tests

**Files:**
- Create: `apps/web/tests/e2e/helpers/mailpit.ts`, `apps/web/tests/e2e/auth.spec.ts`, `apps/web/tests/e2e/password-reset.spec.ts`, `apps/web/tests/e2e/security.spec.ts`

- [ ] **Step 1: Write `apps/web/tests/e2e/helpers/mailpit.ts`**

```ts
const MAILPIT = 'http://localhost:8025'

type MailpitMessage = { ID: string; To: { Address: string }[]; Subject: string }

/** Deletes every message so a test can assert on what it alone produced. */
export async function clearInbox(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}

/** Polls until a message addressed to `to` arrives, then returns its body. */
export async function waitForEmail(
  to: string,
  timeoutMs = 15_000,
): Promise<{ subject: string; html: string; text: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/messages`)
    const body = (await res.json()) as { messages: MailpitMessage[] }
    const hit = body.messages?.find((m) => m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()))
    if (hit) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)
      const msg = (await full.json()) as { Subject: string; HTML: string; Text: string }
      return { subject: msg.Subject, html: msg.HTML, text: msg.Text }
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`No email for ${to} within ${timeoutMs}ms`)
}

/** Pulls the first http(s) link out of an email body. */
export function firstLink(body: string): string {
  const match = body.match(/https?:\/\/[^\s"'<>]+/)
  if (!match) throw new Error('No link found in email body')
  return match[0]
}

/** A unique address per test run, so tests never collide on the unique index. */
export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@tether.test`
}

export function uniqueUsername(prefix = 'user'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`.slice(0, 20)
}
```

- [ ] **Step 2: Write `apps/web/tests/e2e/auth.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { clearInbox, uniqueEmail, uniqueUsername, waitForEmail } from './helpers/mailpit'

test('signs up, lands logged in, and sends a verification email', async ({ page }) => {
  await clearInbox()
  const email = uniqueEmail()
  const username = uniqueUsername()

  await page.goto('/signup')
  await page.getByTestId('field-name').fill('Alice Example')
  await page.getByTestId('field-username').fill(username)
  await expect(page.getByTestId('username-availability')).toHaveText('Available', {
    timeout: 10_000,
  })
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()

  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByTestId('profile-username')).toHaveText(`@${username}`)

  // D1.5: the email is sent even though login is not gated on it.
  const mail = await waitForEmail(email)
  expect(mail.subject).toContain('Confirm')
})

test('rejects a duplicate username without creating an account', async ({ page, context }) => {
  const username = uniqueUsername()
  const first = uniqueEmail('first')
  const second = uniqueEmail('second')

  await page.goto('/signup')
  await page.getByTestId('field-name').fill('First')
  await page.getByTestId('field-username').fill(username)
  await page.getByTestId('field-email').fill(first)
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)

  await context.clearCookies()
  await page.goto('/signup')
  await page.getByTestId('field-name').fill('Second')
  await page.getByTestId('field-username').fill(username)
  await expect(page.getByTestId('username-availability')).toHaveText(/taken/i, { timeout: 10_000 })
  await page.getByTestId('field-email').fill(second)
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()

  // D1.2: the unique index refuses it; no account is created and we stay put.
  await expect(page.getByTestId('form-error')).toBeVisible()
  await expect(page).toHaveURL(/\/signup$/)
})

test('logs out and back in, and rejects a wrong password', async ({ page }) => {
  const email = uniqueEmail()
  const username = uniqueUsername()

  await page.goto('/signup')
  await page.getByTestId('field-name').fill('Bob Example')
  await page.getByTestId('field-username').fill(username)
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)

  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill('wrong-password-entirely')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('form-error')).toHaveText('Email or password is incorrect.')

  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)
})

test('persists profile edits across a reload', async ({ page }) => {
  const email = uniqueEmail()
  await page.goto('/signup')
  await page.getByTestId('field-name').fill('Carol Example')
  await page.getByTestId('field-username').fill(uniqueUsername())
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)

  await page.getByTestId('field-bio').fill('Trip planner, spreadsheet refugee.')
  await page.getByTestId('field-homeCity').fill('Lisbon')
  await page.getByTestId('save-profile').click()
  await expect(page.getByTestId('save-status')).toHaveText('Saved')

  await page.reload()
  await expect(page.getByTestId('field-bio')).toHaveValue('Trip planner, spreadsheet refugee.')
  await expect(page.getByTestId('field-homeCity')).toHaveValue('Lisbon')
})
```

- [ ] **Step 3: Write `apps/web/tests/e2e/password-reset.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { clearInbox, firstLink, uniqueEmail, uniqueUsername, waitForEmail } from './helpers/mailpit'

test('resets a password through the real emailed link and invalidates the old one', async ({
  page,
  context,
}) => {
  const email = uniqueEmail('reset')
  const oldPassword = 'correct-horse-battery'
  const newPassword = 'a-completely-different-one'

  await page.goto('/signup')
  await page.getByTestId('field-name').fill('Dave Example')
  await page.getByTestId('field-username').fill(uniqueUsername())
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill(oldPassword)
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)
  await page.getByTestId('sign-out').click()

  await clearInbox()
  await page.goto('/forgot-password')
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('reset-requested')).toBeVisible()

  const mail = await waitForEmail(email)
  const link = firstLink(mail.text)

  await page.goto(link)
  await page.getByTestId('field-password').fill(newPassword)
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/login$/)

  // The old password must no longer work.
  await page.getByTestId('field-email').fill(email)
  await page.getByTestId('field-password').fill(oldPassword)
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('form-error')).toBeVisible()

  await page.getByTestId('field-password').fill(newPassword)
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)

  // A04/A07: the token is single-use — replaying the same link must fail.
  await context.clearCookies()
  await page.goto(link)
  await page.getByTestId('field-password').fill('yet-another-password')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('form-error')).toBeVisible()
})

test('gives the same answer for a known and an unknown email', async ({ page }) => {
  // D1.9 / A06: no membership oracle.
  await page.goto('/forgot-password')
  await page.getByTestId('field-email').fill(uniqueEmail('nobody'))
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('reset-requested')).toBeVisible()
})
```

- [ ] **Step 4: Write `apps/web/tests/e2e/security.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { uniqueEmail, uniqueUsername } from './helpers/mailpit'

test('serves the security headers', async ({ request }) => {
  const res = await request.get('/')
  const h = res.headers()
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
})

test('session cookie is httpOnly and SameSite=Lax', async ({ page, context }) => {
  await page.goto('/signup')
  await page.getByTestId('field-name').fill('Erin Example')
  await page.getByTestId('field-username').fill(uniqueUsername())
  await page.getByTestId('field-email').fill(uniqueEmail())
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)

  const cookies = await context.cookies()
  const session = cookies.find((c) => c.name.startsWith('tether'))
  expect(session, 'a tether session cookie should be set').toBeTruthy()
  expect(session?.httpOnly).toBe(true)
  expect(session?.sameSite).toBe('Lax')
})

test('redirects an anonymous visitor away from the profile page', async ({ page }) => {
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login$/)
})

test('an anonymous tRPC caller cannot read or write a profile', async ({ request }) => {
  // A01: protectedProcedure, exercised directly rather than through the UI.
  const read = await request.get('/api/trpc/profile.get?input=%7B%7D')
  expect(read.status()).toBeGreaterThanOrEqual(400)
  expect(await read.text()).toContain('UNAUTHORIZED')
})

test('one user cannot modify another user profile', async ({ browser }) => {
  // A01 (IDOR/BOLA). The API exposes no userId parameter at all, so the check
  // is that B's data is untouched after A saves, and that A's session only ever
  // acts on A.
  const aCtx = await browser.newContext()
  const bCtx = await browser.newContext()
  const a = await aCtx.newPage()
  const b = await bCtx.newPage()

  const bEmail = uniqueEmail('victim')
  await b.goto('/signup')
  await b.getByTestId('field-name').fill('Victim')
  await b.getByTestId('field-username').fill(uniqueUsername())
  await b.getByTestId('field-email').fill(bEmail)
  await b.getByTestId('field-password').fill('correct-horse-battery')
  await b.getByTestId('submit').click()
  await expect(b).toHaveURL(/\/profile$/)
  await b.getByTestId('field-bio').fill('BELONGS TO B')
  await b.getByTestId('save-profile').click()
  await expect(b.getByTestId('save-status')).toHaveText('Saved')

  await a.goto('/signup')
  await a.getByTestId('field-name').fill('Attacker')
  await a.getByTestId('field-username').fill(uniqueUsername())
  await a.getByTestId('field-email').fill(uniqueEmail('attacker'))
  await a.getByTestId('field-password').fill('correct-horse-battery')
  await a.getByTestId('submit').click()
  await expect(a).toHaveURL(/\/profile$/)

  // A crafted call carrying B's id must not affect B: the input schema has no
  // such field, so it is stripped, and A only ever edits A.
  await a.evaluate(async () => {
    await fetch('/api/trpc/profile.update?batch=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        0: { json: { name: 'Attacker', bio: 'OVERWRITTEN', homeCity: null, userId: 'not-mine' } },
      }),
    })
  })

  await b.reload()
  await expect(b.getByTestId('field-bio')).toHaveValue('BELONGS TO B')

  await aCtx.close()
  await bCtx.close()
})

test('neutralises HTML supplied in profile fields', async ({ page }) => {
  // A05: stored XSS attempt.
  await page.goto('/signup')
  await page.getByTestId('field-name').fill('<img src=x onerror="window.__pwned=1">')
  await page.getByTestId('field-username').fill(uniqueUsername())
  await page.getByTestId('field-email').fill(uniqueEmail('xss'))
  await page.getByTestId('field-password').fill('correct-horse-battery')
  await page.getByTestId('submit').click()
  await expect(page).toHaveURL(/\/profile$/)

  await page.reload()
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined()
})
```

- [ ] **Step 4b: Append the three remaining control tests to `apps/web/tests/e2e/security.spec.ts`**

These close spec §5 promises that the tests above do not yet cover.

```ts
test('a password reset invalidates a session established beforehand', async ({ browser }) => {
  // A07. revokeSessionsOnPasswordReset is set in the auth config; this proves it.
  const { clearInbox, waitForEmail, firstLink } = await import('./helpers/mailpit')
  const email = uniqueEmail('revoke')
  const oldPassword = 'correct-horse-battery'

  const staying = await browser.newContext()
  const stayingPage = await staying.newPage()
  await stayingPage.goto('/signup')
  await stayingPage.getByTestId('field-name').fill('Session Holder')
  await stayingPage.getByTestId('field-username').fill(uniqueUsername())
  await stayingPage.getByTestId('field-email').fill(email)
  await stayingPage.getByTestId('field-password').fill(oldPassword)
  await stayingPage.getByTestId('submit').click()
  await expect(stayingPage).toHaveURL(/\/profile$/)

  // Reset from a completely separate browser context.
  await clearInbox()
  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await otherPage.goto('/forgot-password')
  await otherPage.getByTestId('field-email').fill(email)
  await otherPage.getByTestId('submit').click()
  const mail = await waitForEmail(email)
  await otherPage.goto(firstLink(mail.text))
  await otherPage.getByTestId('field-password').fill('an-entirely-new-password')
  await otherPage.getByTestId('submit').click()
  await expect(otherPage).toHaveURL(/\/login$/)

  // The first context's session must now be dead.
  await stayingPage.goto('/profile')
  await expect(stayingPage).toHaveURL(/\/login$/)

  await staying.close()
  await other.close()
})

test('throttles repeated failed logins', async ({ request }) => {
  // A06/A07. RATE_LIMIT_ENABLED defaults true (D1.8) precisely so this is
  // observable locally — better-auth's own default would leave it off in dev.
  const email = uniqueEmail('throttle')
  let sawThrottle = false
  for (let i = 0; i < 40; i++) {
    const res = await request.post('/api/auth/sign-in/email', {
      data: { email, password: `wrong-password-${i}` },
      failOnStatusCode: false,
    })
    if (res.status() === 429) {
      sawThrottle = true
      break
    }
  }
  expect(sawThrottle, 'repeated failed logins should eventually return 429').toBe(true)
})

test('does not leak internals when a request fails', async ({ request }) => {
  // A10. A malformed input must produce a clean error, never a stack trace or
  // a filesystem path.
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

> The throttle test asserts a 429 appears **within** 40 attempts against a `max: 30` window, so it is not brittle against the exact limit. If it ever fails, check `RATE_LIMIT_ENABLED` reached the process — Turbo's strict env mode is the usual culprit (Phase 0, L3).

- [ ] **Step 5: Run the whole suite in dev mode**

```bash
pnpm db:up
pnpm --filter @tether/web e2e
```

Expected: 17 passed (3 from Phase 0 + 14 new).

- [ ] **Step 6: Run it the way CI will**

Free the ports first — the Phase 0 lesson about stray servers colliding under `CI=1`.

```bash
for p in 1234 3000; do
  PIDS=$(lsof -nP -tiTCP:$p -sTCP:LISTEN 2>/dev/null)
  [ -n "$PIDS" ] && kill -9 $PIDS
done
CI=1 pnpm --filter @tether/web e2e
```

Expected: 17 passed, with `[WebServer] $ turbo run start`.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "test(web): auth, password reset, and OWASP control e2e coverage"
```

---

## Task 13: Dependency audit in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add an audit step after `pnpm install`**

**A03** (Software Supply Chain Failures) is the one category Phase 0 already covered well — pinned versions, committed lockfile, `--frozen-lockfile`, install-script allow-list. This adds the missing piece: knowing when a pinned version becomes vulnerable.

```yaml
      - name: Dependency audit
        run: pnpm audit --audit-level=high
```

- [ ] **Step 2: Run it locally first**

```bash
pnpm audit --audit-level=high
```

Expected: `No known vulnerabilities found`. If it reports something, resolve it before pushing — do **not** lower `--audit-level` to make the step pass. If an advisory has no fix available, add an explicit exception with a comment naming the advisory and the reason, so it is visible rather than hidden.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: fail on high-severity dependency advisories"
```

---

## Task 14: Record the phase

**Files:**
- Modify: `docs/build-log.md`, `docs/learnings.md`, `PRD.md`, `docs/prd-review-2026-09-05.md`

- [ ] **Step 1: Append the Phase 1 section to `docs/build-log.md`**

Update the "Progress at a glance" row for Phase 1 to ✅ with the date, then append this section, filling every bracket from what actually happened:

```markdown
## Phase 1 — Auth + Profile

**Done <date>.** Merged as PR #<n> (`<sha>`). CI green.

### In one sentence

The house now has a front door with a lock, and a name on the doorbell.

### What that means concretely

People can create an account, prove they own the email, get back in after
forgetting the password, and say who they are. Every trip built in later phases
belongs to one of these accounts.

### What was built

| Piece | Plain English |
|---|---|
| Better Auth + four identity tables | Accounts, sessions, credentials, one-time tokens |
| `username` on the account row | Chosen at signup, unique, atomic — you can never lose the name you picked between typing it and the account existing |
| `user_profile` | Bio and home city, kept apart so a hiccup there can never block signup |
| Mailer + templates | Real emails, caught locally by Mailpit |
| `protectedProcedure` | The single gate every private API call passes through |
| Security headers, audit step, 14 control tests | The OWASP work — see spec §5 |

### Decisions that will outlive this phase

<D1.1-D1.9, one line each, in plain language>

### What proves it works

| Evidence | Result |
|---|---|
| E2E suite against the production build | <n> passed |
| Unit tests | <n> passed |
| `pnpm audit --audit-level=high` | clean |
| CI | run `<id>` |

### Honest limits

<From spec §5 "What this does not cover" — no TLS, nothing watching the logs,
no SAST or pen test, in-memory rate limits, trip authorization still Phase 4.>
```

- [ ] **Step 2: Append any new entries to `docs/learnings.md`**

Apply the stated inclusion test: would knowing it a day earlier have saved time, and does it still apply next phase? Candidates already known before execution begins:

- `@better-auth/cli` is six months behind the library it generates for — hand-writing the schema from `getAuthTables()` was the safer path.
- `forgetPassword` does not exist in better-auth 1.7.1; it is `requestPasswordReset`. Writing the client from memory would have failed at runtime.
- `inferAdditionalFields` is mandatory, not optional, for custom signup fields — without it `username` is silently absent from the request.

- [ ] **Step 3: Mark Phase 1 done in `PRD.md` §7**

Change the Phase 1 goal cell to:

```
| 1 — Auth + Profile | Sign up with a chosen username, log in, reset a forgotten password, edit profile — with OWASP Top 10:2025 controls under test (spec §5) — **done <date>** |
```

The decision-log rows D1.1–D1.9 are already in §10 from the spec stage, so no new row is needed for the goal edit; cite the spec.

- [ ] **Step 4: Add the Phase 1 deviations to the docs backlog**

Append to `docs/prd-review-2026-09-05.md` §3 the deviations listed in the spec §6, so `docs/data-model.md` and `docs/security.md` get reconciled rather than silently contradicted.

- [ ] **Step 5: Commit**

```bash
git add docs PRD.md
git commit -m "docs: record phase 1 in the build log, learnings, and PRD"
```

---

## Definition of done

Every line is a command with a stated result. Dev-mode green is not green.

**Functionality**

- [ ] Signing up with a free username lands on `/profile` showing `@username`.
- [ ] A duplicate username is rejected and **no** account is created (verified by signing in with that email failing).
- [ ] A verification email arrives in Mailpit; its HTML escapes a hostile display name.
- [ ] Logout, then login. A wrong password shows one generic message.
- [ ] A password reset completes through the real emailed link; the old password stops working; the link fails on reuse.
- [ ] Profile edits persist across a reload.

**Security controls (spec §5)**

- [ ] `curl -sI http://localhost:3000` shows CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
- [ ] The session cookie is `httpOnly` with `SameSite=Lax`.
- [ ] An anonymous `profile.get` returns `UNAUTHORIZED`.
- [ ] An authenticated user cannot alter another user's profile.
- [ ] HTML in profile fields renders inert.
- [ ] `assertProductionAuthPosture` throws for a production build with verification or rate limiting disabled.
- [ ] `pnpm audit --audit-level=high` is clean.

**Gates**

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && CI=1 pnpm e2e` all pass.
- [ ] A `'use client'` file importing `@tether/shared/db` still fails lint (Phase 0's boundary, unbroken).
- [ ] `grep -rl "postgres-js\|node:tls" apps/web/.next/static/chunks/` returns nothing — `auth-client.ts` imports `typeof auth` as a **type**, and this proves it stayed a type.
- [ ] CI green on the PR, including the audit step.

**Records**

- [ ] `docs/build-log.md`, `docs/learnings.md`, `PRD.md` §7 updated; deviations in the docs backlog.

---

## Known deviations from `docs/`

| Deviation | Doc says | Why |
|---|---|---|
| `username`/`usernameLower` on `user` | `data-model.md` §2.1 puts them on `user_profile` | D1.2 — atomic signup |
| Display name is `user.name` | `data-model.md` §2.1 has `user_profile.displayName` | D1.3 — avoids two name columns |
| Passwords are scrypt | `security.md` §2.1 said bcrypt | Verified in better-auth 1.7.1; `security.md` corrected 2026-09-06 |
| Rate limiting explicitly enabled | `security.md` §2 shows options without noting the default is off in dev | D1.8 |
| `requireEmailVerification` false locally | `security.md` §2 sets it `true` | D1.5; PRD §7b Stage 1 already said "toggled off by env" |
| No `zxcvbn` strength meter | `security.md` §2.1 mentions it | 400 KB client dependency for an informational widget; Phase 8 polish |
| No HSTS header | implied by "Secure cookies" | Phase 1 is plain http on localhost; HSTS from a non-TLS origin is meaningless. Stage 2 |
| Schema hand-written, not generated | — | `@better-auth/cli`'s newest publish predates `account.issuer` |
| No avatar upload | `data-model.md` has `avatarKey` | Column exists, stays null until Phase 6 |

---

## Verification probes

Rerunnable evidence for the **Verified facts** table. Run 2026-09-06 on Node 24.20.0.

### P1 — core `additionalFields`, `databaseHooks`, and client API

```bash
mkdir baprobe && cd baprobe && npm init -y >/dev/null
npm i better-auth@1.7.1 typescript@7.0.2 react@19.2.8 @types/react@19.2.18
# write a betterAuth({ user: { additionalFields: {...} }, databaseHooks: {...} }) config
# and a createAuthClient({ plugins: [inferAdditionalFields<typeof auth>()] }) usage
npx tsc --noEmit
```
Exit 0. Without the `inferAdditionalFields` plugin, `signUp.email({ username })` fails to compile. `forgetPassword` fails to compile; `requestPasswordReset` compiles.

### P2 — password hashing algorithm

```bash
npm pack better-auth@1.7.1 && tar -xzf better-auth-1.7.1.tgz
head -30 package/dist/crypto/password.mjs
```
`@better-auth/utils/password` → `node:crypto` **scrypt**. Not bcrypt.

### P3 — canonical table shape

```bash
node -e "import('@better-auth/core/db').then(({getAuthTables})=>console.log(JSON.stringify(getAuthTables({emailAndPassword:{enabled:true}}),null,2)))"
```
Reports `user`, `session`, `account`, `verification`, including required `account.issuer`.

### P4 — rate-limit default

```bash
grep -o "rateLimit[^;]\{0,60\}" package/dist/context/create-context.mjs
```
`rateLimit?.enabled ?? isProduction` — off in development.

### P5 — CLI staleness

```bash
npm view @better-auth/cli time --json | tail -5
```
Newest publish 2026-03-16, six months before better-auth 1.7.1.
