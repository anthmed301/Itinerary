# Security

> Auth + authorization + secrets + abuse + privacy. The trust boundary doc.

---

## 1. Threat model — who we're defending against

| Adversary | Capability | Defended by |
|---|---|---|
| Casual user trying to view a private trip via guessed URL | Random UUID guessing | UUIDv4 trip IDs (122 bits entropy); tRPC auth middleware refuses non-members |
| Authenticated user trying to modify a trip they're a viewer on | Crafted tRPC requests | Role check in `requireTripAccess('editor')` |
| Spammer trying to create thousands of fake accounts | Email + password automation | Rate limit on signup; email verification gate; abuse heuristics post-launch |
| Scraper of public Explore | HTTP scraping at scale | Rate limit; standard. Public is public. |
| Prompt injector in trip notes | Embed instructions in user fields read by LLM | Sandboxed prompt wrappers; structured output schema rejects free text exploits |
| Attacker who steals a session cookie | Replay session | Sessions DB-backed, expirable, rotatable on password change; httpOnly + Secure + SameSite=Lax |
| Compromised AI key | API key leaked | Stored in AWS Secrets Manager; rotated quarterly; never in client code |
| Compromised DB | Data exfiltration | Postgres in private subnet; IAM auth; encrypted at rest; no public ingress |

We are **not** defending against:
- Nation-state actors with arbitrary 0-days.
- Insider threats (just us; trust by accountability for v1).
- Side-channel timing attacks (low-priority for this product).

## 2. Authentication — Better Auth config

```ts
// apps/web/src/server/auth/index.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    autoSignIn: false,
    sendResetPassword: async ({ user, url }) => sendPasswordResetEmail(user.email, url),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => sendVerificationEmail(user.email, url),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,        // 30 days
    updateAge: 60 * 60 * 24,             // refresh once a day
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: { window: 60, max: 60 },     // built-in; ours adds tRPC layer too
  trustedOrigins: [env.PUBLIC_APP_URL],
  advanced: {
    cookiePrefix: 'tether',
    useSecureCookies: env.NODE_ENV === 'production',
  },
})
```

### 2.1 Password requirements
- ≥ 10 characters.
- Score ≥ 3 from zxcvbn (client-side). Server enforces minimum length only; we don't reject on entropy because it leads to bad UX. Strong-meter is informational.
- Better Auth hashes with **scrypt** via `node:crypto` (`@better-auth/utils/password`), not bcrypt. Verified against `better-auth@1.7.1` on 2026-09-06; an earlier draft of this doc said bcrypt and advised tuning a cost factor that does not exist. scrypt parameters are the library's defaults; revisit only with a benchmark, not by analogy to bcrypt.

### 2.2 Email verification
- Required before any social action (publish, comment, follow).
- Unverified users *can* create private trips (avoids dead-end onboarding).
- Verification email link expires in 24h. Resend rate-limited 1/min.

### 2.3 Password reset
- POST `/api/auth/forgot-password` triggers email with a signed token.
- Token valid 1h, single-use.
- Successful reset rotates session; logs user out everywhere.

### 2.4 Sessions
- Stored in `session` table (Better Auth's). Cookie holds session ID only.
- `httpOnly`, `Secure` (in prod), `SameSite=Lax`.
- Logout revokes server-side; cookie clears.
- "Sign out everywhere" available in settings — deletes all sessions for the user.

## 3. Authorization — three layers

### 3.1 Layer 1: tRPC middleware (the contract)
See `docs/api.md` §3. Every protected procedure runs `requireAuth`; trip-scoped procedures run `requireTripAccess(role)`. The middleware loads the `trip_member` row and attaches `member` to context.

### 3.2 Layer 2: Drizzle queries
Every query that touches a trip-scoped resource joins through `trip_member` for the current user. Example — listing comments only on trips you can view:

```ts
const comments = await db
  .select()
  .from(tripComment)
  .innerJoin(trip, eq(trip.id, tripComment.tripId))
  .leftJoin(tripMember, and(eq(tripMember.tripId, trip.id), eq(tripMember.userId, ctx.userId)))
  .where(or(
    eq(trip.privacy, 'public'),
    isNotNull(tripMember.userId),                 // I'm a member
    eq(trip.ownerId, ctx.userId),                  // I'm the owner
  ))
```

For "unlisted" trips: requires either `trip_member` row OR you came via a signed share-link (in which case the URL contains a HMAC-validated token verified by the server before rendering — see §4.4).

### 3.3 Layer 3: Hocuspocus auth extension
JWT-gated WSS connection (see `docs/realtime-collab.md` §6).

We do **not** use Postgres RLS; centralization in tRPC is auditable and Postgres is private.

### 3.4 Authorization tests
For every trip-scoped procedure, a Vitest matrix runs:
```
[owner, editor, viewer, stranger] × [each procedure] → expected pass/fail
```
File: `apps/web/src/server/trpc/__tests__/authz.test.ts`. Catches regressions when adding new procedures.

## 4. Privacy + sharing

### 4.1 Three states

| State | Visible to | Indexed | Mutable by |
|---|---|---|---|
| `private` (default) | owner + members | no | members per role |
| `unlisted` | anyone with the link | no | members per role |
| `public` | anyone (Explore + URL) | yes (FTS, sitemap) | members per role |

### 4.2 Publish flow
`trip.publish` requires:
- Owner role.
- `trip.title` non-empty.
- `trip.startDate` set.
- ≥ 1 day with ≥ 1 activity.
- Email-verified user.

When published: privacy → `public`, `publishedAt = now`, indexed in FTS, eligible for Explore.

### 4.3 Unpublish
Sets privacy back to `private`. Removes from Explore index. Existing share-links keep working only if you separately set privacy to `unlisted`.

### 4.4 Unlisted share-link tokens
Unlisted trips don't have a special URL — same `/trips/[id]` path. Server-side render checks:
- If user is signed in and a member: render.
- Else: requires a `?t=<token>` HMAC param. Token = `HMAC(secret, tripId)`. Mismatch or missing → 404.

This avoids leaking token-less unlisted URLs. The "Copy share link" button generates the URL with the token.

### 4.5 Forks
- `trip.fork` allowed if source trip is public (unlisted-with-token also allowed if user came via the share link).
- Forked trip is private by default; sets `forkedFromTripId`.
- Source trip's owner sees fork count incremented; doesn't see *who* forked unless the fork is later published.
- Forking a private trip: not allowed. 403.

## 5. Username security

- Reserved list (case-insensitive): `admin`, `tether`, `support`, `help`, `api`, `auth`, `login`, `signup`, `settings`, `explore`, `trips`, `profile`, `terms`, `privacy`, `home`, `app`, `www`, `mail`, `team`. Stored in `apps/web/src/server/auth/reserved-usernames.ts`.
- Username pattern: `/^[a-z0-9_]{3,32}$/i`. No leading/trailing underscores.
- Stored canonicalized as `username_lower` (lowercase) for uniqueness; original case preserved for display.
- Changing username: allowed once per 30 days (prevents impersonation churn). Old username goes into a 90-day reservation pool before being claimable again.

## 6. Secrets management

Categories:
| Secret | Storage | Access |
|---|---|---|
| DB connection string | AWS Secrets Manager | App via IAM role; never logged |
| Better Auth session secret | AWS Secrets Manager | App + Hocuspocus |
| Hocuspocus JWT secret | AWS Secrets Manager | App + Hocuspocus |
| Gemini API key | AWS Secrets Manager | App only (server-side AI calls) |
| Tavily API key | AWS Secrets Manager | App only |
| Foursquare API key | AWS Secrets Manager | App only |
| Mapbox **public** token | env var, restricted to `tether.app` domain | App + client |
| SES SMTP creds | AWS Secrets Manager | App only |
| S3 access | IAM role (no static keys) | App's ECS task role |

Rotation: API keys quarterly (calendar reminder); session/JWT secrets immediately on suspected breach (with session invalidation).

`.env.local` is the dev-only file; never committed. `.env.example` lists required keys with `# get from <source>` comments.

## 7. Input validation

- All tRPC inputs are Zod-validated.
- File uploads (S3 presigned PUT) are gated to:
  - Allowed content types: `image/jpeg`, `image/png`, `image/webp`.
  - Max 8 MB.
  - Server-generated key (user can't choose path).
- Image dimension/strip-EXIF: post-upload Lambda runs `sharp` to resize + strip metadata, replaces original.

## 8. CSRF

tRPC over fetch with `Content-Type: application/json` is not classically CSRF-vulnerable (browsers won't auto-set the header on cross-site POSTs). We additionally:
- Set `SameSite=Lax` on session cookie.
- For Better Auth's REST routes, rely on its built-in CSRF.
- For SSE (`/api/ai/stream`) which is GET-via-POST: same cookie; same protections.

## 9. XSS

- All user content rendered through React (which escapes by default).
- Markdown rendering (trip summaries, comments): use `react-markdown` with disabled HTML; allow only safe Markdown subset (no raw HTML, no images via data: URIs).
- Avatars/cover images: rendered through `next/image`, served from S3 via our domain; no third-party arbitrary URLs.

## 10. Content moderation

For v1, lightweight:
- `report_trip` — flag on public trips (added in Phase 6). Stored in `report` table; queue surfaces in admin (post-launch).
- AI moderation: pre-publish, run trip title + summary through Gemini's safety classifier. Block on `harassment`, `dangerous`, `sexual`. Rate-limited 1/sec.
- Comments: on save, same classifier. Blocked content shows "This comment couldn't be posted." with no detail (avoid telling spammers what's filtered).
- We don't do real-time moderation on private trips.

## 11. Privacy regulations

| Regulation | Stance | Implementation |
|---|---|---|
| GDPR (EU users) | Comply | Export endpoint (v2); delete-account cascades; data processing agreement page; clear cookie consent |
| CCPA (CA) | Comply | Same-as-GDPR mechanics |
| COPPA (under-13) | Block | Signup blocks ages < 13 (DOB collection during signup) |

For v1, we ship: privacy policy + terms page (drafted with an LLM-assist + reviewed by you), opt-out marketing email checkbox at signup (default off). Full GDPR data-export tooling lands in Phase 9 or post-launch.

## 12. Logging hygiene

- Never log: passwords, session tokens, JWT contents, API keys, location lat/lng, raw email contents.
- OK to log: `userId`, `tripId`, `path`, `status`, `durationMs`, `error.code`.
- Server logs go to CloudWatch; retention 30 days for INFO, 90 days for ERROR.

## 13. Network + infra security

- Postgres RDS in private subnet; only ECS task security group can reach 5432.
- Hocuspocus runs in same VPC; communicates with RDS over IAM auth.
- Public ALB terminates TLS at AWS Certificate Manager; HTTP→HTTPS redirect; HSTS with `preload`.
- S3 buckets: block public access at account level; only presigned URLs grant temporary read for non-public images. Public-trip cover images are stored in a separate bucket with bucket policy allowing GET.

## 14. Trip-mode location privacy (cross-link to trip-mode.md §4)

Worth restating here:
- Off by default. Per-trip toggle.
- Hard-deleted on revoke. Hard-deleted 24h after trip end.
- Visible only to other members of *this* trip.
- Server logs never include lat/lng.

## 15. Incident response — first hour

If a real-or-suspected breach happens:
1. Rotate all API keys + session/JWT secrets in AWS Secrets Manager.
2. Invalidate all active sessions (`UPDATE session SET expiresAt = NOW()`).
3. If DB-level: snapshot RDS, lock down ingress.
4. Notify affected users within 72h if PII exposure suspected.
5. Post-mortem in `docs/incidents/YYYY-MM-DD.md`. No blame.

## 16. What we are *not* doing in v1 (and why)

| Skipped | Why | Add when |
|---|---|---|
| 2FA | Friction for POC; Better Auth supports TOTP — turn on later | Pre-launch Phase 8 |
| Passkeys | Same; Better Auth supports them | When iOS lands |
| OAuth (Google, Apple) | Phase 8 if time; otherwise v2 | iOS launch / public launch |
| WebAuthn | Same | v2 |
| Anomaly detection (login from new country) | Too much infra for POC | Post-public-launch |
| Email-bomb protections | Resend captcha not built; rely on rate limits | When abuse appears |
| Bug bounty program | Pre-product-market fit | After 1000 users |
| SOC 2 / pentest | Not needed for free POC | Before enterprise sales (years away) |
