# Architecture

> Topology, monorepo layout, request flow, deployment shape, env strategy. Read this before touching `apps/web` or `services/realtime`.

---

## 1. The big picture

```
                         ┌────────────────────┐
                         │    Browser (web)   │
                         │  Next.js client    │
                         └──────┬──────┬──────┘
                                │      │
                  HTTPS (tRPC)  │      │ WSS (Yjs)
                                │      │
                ┌───────────────▼┐    ┌▼─────────────────────────┐
                │ Next.js server │    │ Hocuspocus (Yjs server)  │
                │ (Amplify/ECS)  │    │ ECS Fargate, single task │
                │  - tRPC routes │    │  - per-trip Yjs document │
                │  - REST callbk │    │  - presence + awareness  │
                │  - SSR Explore │    │  - persistence webhook   │
                └─┬──────────────┘    └──────────┬───────────────┘
                  │                              │
       ┌──────────┼──────────────────────────────┼──────────┐
       │          │                              │          │
   ┌───▼─┐  ┌─────▼─────┐  ┌─────────────┐  ┌────▼───┐  ┌───▼───┐
   │ S3  │  │ Postgres  │  │ Gemini Flash│  │ Tavily │  │ SES   │
   │ img │  │ (RDS/Doc) │  │ (Google)    │  │ (web)  │  │ email │
   └─────┘  └───────────┘  └─────────────┘  └────────┘  └───────┘
                  ▲                ▲
                  │                │ (place enrichment)
                  └─Foursquare─────┘
                  └─Mapbox tiles───→ (browser direct)
```

**Two deploys, one DB.** The Next.js app and the Hocuspocus realtime server are separate services. They share Postgres for persistence and S3 for blobs. Hocuspocus authenticates connections via a signed JWT issued by Next.js (so we don't run two auth stacks).

## 2. Monorepo layout

```
tripi/
  package.json                    # root, workspaces, turbo
  pnpm-workspace.yaml
  turbo.json
  .env.example                    # the canonical env contract
  PLAN.md
  README.md
  docker-compose.yml              # local: postgres + hocuspocus + minio (S3 mock)
  docs/                           # all design docs
  apps/
    web/                          # Next.js 15 App Router
      src/
        app/                      # routes
          (marketing)/            # / and /pricing later
          (auth)/                 # /login /signup /reset
          (app)/                  # everything behind auth
            trips/[id]/
              page.tsx            # trip view (planning OR trip-mode)
              edit/page.tsx
            explore/page.tsx
            profile/[username]/page.tsx
            settings/page.tsx
          api/
            trpc/[trpc]/route.ts
            auth/[...all]/route.ts # Better Auth catch-all
            uploads/sign/route.ts  # S3 presigned URLs
            ai/stream/route.ts     # AI streaming (Gemini)
            hocuspocus/token/route.ts # mints Yjs JWTs
        server/                   # server-only modules
          db/                     # drizzle client, schema, migrations
          trpc/                   # routers, context, middleware
          auth/                   # better-auth config
          ai/                     # Gemini + Tavily clients, prompts
          places/                 # Foursquare client
          email/                  # SES client + templates
          rate-limit/             # in-memory + DB-backed limiter
        components/               # React components (UI)
        lib/                      # client-safe utils
        styles/                   # Tailwind config, tokens
    docs-site/                    # (post-launch) marketing/docs
  services/
    realtime/                     # Hocuspocus server (Node)
      src/server.ts
      src/extensions/             # auth, persistence, throttle
      Dockerfile
  packages/
    db/                           # drizzle schema (shared web ↔ realtime)
    config/                       # env loader, zod schemas
    ui/                           # design-system primitives (Radix + ours)
    tokens/                       # design tokens (TS + CSS vars)
    yjs-schema/                   # the Yjs doc shape (helpers + types)
    test-utils/                   # factories, fixtures, db reset
  infra/
    aws/                          # CDK or Terraform (CDK recommended)
      stacks/
        web-stack.ts              # Amplify / Next.js
        realtime-stack.ts         # ECS Fargate + ALB
        data-stack.ts             # RDS, S3, secrets
        observability-stack.ts    # CloudWatch dashboards
```

**Why this shape:**

- `apps/web` and `services/realtime` are sibling deploys; they share schema via `packages/db` and Yjs doc shape via `packages/yjs-schema`. No drift.
- `infra/` ships as code (CDK) so the POC is reproducible by anyone.
- `packages/tokens` is the single source of design tokens — Tailwind config and CSS variables both consume it.

## 3. Request flow — the seven main paths

| # | Request | Path |
|---|---------|------|
| 1 | Page load (SSR) | Browser → Next.js server → tRPC server-side caller → Postgres → render → Browser |
| 2 | Mutation (e.g. add activity) | Browser → tRPC HTTP → Next.js server → authz → Drizzle → Postgres → invalidate cache |
| 3 | Real-time edit | Browser → Yjs awareness/update → WSS → Hocuspocus → fan out to other clients → debounced persist to Postgres |
| 4 | AI suggestion | Browser → `/api/ai/stream` (POST) → server: build prompt → Gemini SDK with stream → Browser receives SSE → user drags result |
| 5 | Image upload | Browser → `/api/uploads/sign` → presigned PUT → S3 directly → Browser confirms by tRPC `attachImage` |
| 6 | Place search | Browser → tRPC `places.search` → server → Foursquare → server caches result in `place` table → return |
| 7 | Map render | Browser → Mapbox CDN directly (token in client env, restricted to our domain) |

## 4. Environment matrix

Three environments; same code:

| Env | Purpose | DB | Realtime | S3 | Domain |
|---|---|---|---|---|---|
| `local` | Day-to-day dev | Docker Postgres | Hocuspocus in Docker | MinIO container | http://localhost:3000 |
| `preview` | Per-PR preview | Branched RDS | Single Hocuspocus task | S3 prefix per branch | amplify-generated URL |
| `production` | The real thing | RDS Multi-AZ | Hocuspocus ECS service ≥1 task | S3 prod bucket | TBD |

Env vars live in `.env.local` (gitignored) for local; AWS Parameter Store for preview/prod. `packages/config` exports a Zod-validated `env` object so missing vars fail at boot, not at runtime.

## 5. Hocuspocus deployment

Hocuspocus is the most opinionated piece — see `docs/realtime-collab.md` for the inside view. Topology summary:

- **POC:** 1 ECS Fargate task, 0.5 vCPU / 1 GB RAM. Single instance — fine up to ~500 concurrent editors.
- **Pre-launch:** scale to ≥2 tasks behind an Application Load Balancer with sticky sessions; add Redis ElastiCache (cache.t4g.micro free tier) for cross-task pub/sub via the `@hocuspocus/extension-redis` extension.
- **Persistence:** custom extension that writes Yjs binary state to Postgres via the same Drizzle client (no service-to-service HTTP).
- **Auth:** connection requires a JWT signed by the Next.js server; JWT contains `userId`, `tripId`, `role`. Hocuspocus rejects mismatched `tripId` or expired tokens.

## 6. Caching strategy

Three layers, conservative. We add caching only where it removes a real bottleneck.

| Layer | Where | TTL | Invalidation |
|---|---|---|---|
| **HTTP** | Public trip pages (Explore, profiles) | 60s | On publish/like/comment events |
| **TanStack Query** | Client-side per-route | until stale | tRPC mutations call `utils.x.invalidate()` |
| **Postgres FTS** | Search | n/a | Triggers on insert/update of `trip` and `user` |

No Redis cache layer in v1. Add only when a specific query proves slow under load.

## 7. Background jobs

In v1, there are exactly four:

1. **Yjs snapshot persistence** — Hocuspocus extension, every 5s + on disconnect. Not a job, an in-process side effect.
2. **Email sending** — fire-and-forget from tRPC handlers via SES. If SES rate-limits, retry once.
3. **Image cleanup** — nightly Lambda scheduled via EventBridge: removes S3 objects whose `entity_id` no longer exists in DB.
4. **Yjs doc GC + snapshot** — nightly Lambda: for every trip, load latest Yjs state, run `Y.encodeStateAsUpdate()` to compact, write back. Drops history > 30 days.

We deliberately skip a queue (SQS, BullMQ) for v1. When we need one (write-model feed fan-out, web-search-cache warming), we add SQS + Lambda consumers.

## 8. Where complexity lives — and where it doesn't

**Lives:**
- The Yjs document and how it reconciles with Postgres (`docs/realtime-collab.md`).
- LexoRank reordering across collaborators (`docs/data-model.md` §3).
- AI prompt design and verification round-trips (`docs/ai-integration.md`).
- Privacy + role enforcement at three layers: tRPC, Hocuspocus, Postgres queries (`docs/security.md`).

**Doesn't:**
- The trip view / explore / profile pages are conventional CRUD with optimistic UI.
- Auth is delegated to Better Auth; we mostly configure it.
- Maps are dumb pin-rendering.

When the complexity ratio reverses, audit yourself.

## 9. Service boundaries that matter

The clearest boundaries — break these and the system rots:

1. **`packages/db` is the only place SQL lives.** No raw queries elsewhere.
2. **`packages/yjs-schema` is the only place that defines the shared Yjs doc shape.** Both web and realtime import from it.
3. **`apps/web/src/server/` is server-only.** Anything imported into a client component must live in `apps/web/src/lib/`.
4. **AI prompts live in `apps/web/src/server/ai/prompts/` as version-tagged TS modules.** Not strings inline.
5. **Foursquare and Tavily responses are cached in Postgres before being returned to clients.** Never call them from the browser.

## 10. Why not...?

| Option | Why not |
|---|---|
| Vercel | Hobby tier prohibits commercial use; Pro is $20/seat/mo; we already have AWS. |
| Supabase | We want infra control + custom API; Better Auth handles auth without it. |
| Liveblocks / PartyKit | Free tiers cap below our public-Explore-launch traffic; vendor lock-in. |
| GraphQL / Apollo | tRPC is strictly simpler when the client and server share a TS codebase. |
| Server Actions instead of tRPC | Server Actions don't compose well with realtime + AI streaming + non-Next clients (when iOS lands). tRPC stays. |
| Microservices | Two services (web + realtime) is the right ceiling for one team's first year. Don't fragment. |
