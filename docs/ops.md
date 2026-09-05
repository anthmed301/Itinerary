# Operations

> Local dev, CI/CD, AWS deployment, observability, backups, runbooks, and the cost ladder. The "how do we run this thing" doc.

> **Solo v1 operating philosophy (2026-09-05):** build the minimum ops needed to run reliably for yourself; add hardening (IaC, formal observability, on-call, backup drills) iteratively as real usage grows or a public/multi-user launch actually approaches — not upfront. Sections below are marked **[v1: manual/deferred]** where this applies; the fuller version stays written down for when it's actually needed.

---

## 1. Local development

One command setup:

```bash
git clone <repo>
cd tripi
cp .env.example .env.local
pnpm install
pnpm db:up          # docker compose up -d for postgres + minio + hocuspocus
pnpm db:migrate     # drizzle-kit migrate
pnpm db:seed        # demo data
pnpm dev            # turbo run dev — starts apps/web and services/realtime
```

`pnpm dev` should produce a working app at http://localhost:3000 within 60 seconds of a fresh `pnpm install`.

### 1.1 Docker Compose

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: tripi
      POSTGRES_PASSWORD: tripi
      POSTGRES_DB: tripi
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD', 'pg_isready', '-U', 'tripi']
      interval: 5s
      retries: 5

  hocuspocus:
    build: ./services/realtime
    depends_on: [postgres]
    environment:
      DATABASE_URL: postgresql://tripi:tripi@postgres:5432/tripi
      HOCUSPOCUS_JWT_SECRET: dev-only-not-secret
    ports: ['1234:1234']

  minio:
    image: minio/minio
    command: server /data --console-address ':9001'
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio12345
    ports: ['9000:9000', '9001:9001']
    volumes: ['minio:/data']

volumes:
  pgdata:
  minio:
```

MinIO mocks S3; we configure the AWS SDK with the MinIO endpoint in dev.

### 1.2 Scripts

```json
// package.json (root, partial)
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "db:up": "docker compose up -d postgres minio hocuspocus",
    "db:down": "docker compose down",
    "db:reset": "docker compose down -v && pnpm db:up && sleep 3 && pnpm db:migrate && pnpm db:seed",
    "db:migrate": "pnpm --filter @tripi/db drizzle-kit migrate",
    "db:generate": "pnpm --filter @tripi/db drizzle-kit generate",
    "db:seed": "pnpm --filter @tripi/web tsx src/server/db/seed.ts",
    "e2e": "pnpm --filter @tripi/web playwright test"
  }
}
```

## 2. CI/CD — GitHub Actions

**[v1: single workflow]** One `ci.yml`, runs on every push and PR — this is the only workflow until there's an actual deploy pipeline worth protecting with more:

```yaml
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: tripi, POSTGRES_USER: tripi, POSTGRES_DB: tripi }
        options: --health-cmd "pg_isready -U tripi" --health-interval 5s
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm e2e
        env:
          DATABASE_URL: postgresql://tripi:tripi@localhost:5432/tripi
```

Deployment for v1 is manual (Amplify auto-deploys on push to `main` via its own GitHub connection — no extra workflow needed for that; the realtime service is redeployed by hand with a one-line `aws ecs update-service --force-new-deployment` when its image changes).

**Deferred until it's actually needed:** a separate `main.yml` (Docker build/push to ECR + scripted ECS deploy) once manual redeploys of the realtime service get old, and a `nightly.yml` (drift detection, cost reporting) once there's infra worth drift-checking (see §3.4) or a cost history worth trending (the cost ladder in §7 is checked by hand for now).

### 2.1 Secrets
GitHub Actions uses an OIDC-federated AWS role (no static keys) once CI needs AWS access at all (e.g. to run `db:migrate` against a real DB). Minimal permissions only.

## 3. AWS deployment

### 3.1 Architecture

```
Route 53                                 (when we have a domain)
   │
   └─→ ACM cert
       │
       ├─→ Amplify (apps/web)               ←── auto-deploys from GitHub main
       │     └─→ Lambda@Edge / SSR Lambda
       │
       └─→ ALB (multi-AZ)
             └─→ ECS Fargate service "realtime"
                  └─→ task: services/realtime container

   apps/web SSR Lambda + ECS task → RDS Postgres (private subnet)
                                  → S3 (bucket-tripi-prod)
                                  → SES
                                  → External: Gemini, Tavily, Foursquare, Mapbox
```

### 3.2 Why Amplify for `apps/web`
- Native Next.js support (SSR + ISR).
- Built-in branch previews (each PR gets a URL).
- Free tier: 1000 build minutes/mo, 15GB served/mo, 5GB stored.
- One-click logs.

If at some point Amplify's Next.js story falters, we move to ECS or Vercel paid; the app code stays the same.

### 3.3 Why ECS Fargate for `services/realtime`
- Long-lived processes; not Lambda-suitable.
- Fargate eliminates EC2 management.
- Single task at POC; scales horizontally with ALB sticky sessions.

### 3.4 Infrastructure as code: AWS CDK — **[v1: deferred, deploy manually]**

For v1, RDS/S3/Secrets Manager/ECS Fargate are created by hand via the AWS Console or one-off CLI commands, and `apps/web` is connected to Amplify directly through its GitHub integration. No CDK stacks yet.

Write the CDK stacks once the manual setup has been rebuilt more than twice (new environment, disaster recovery, or an actual second person/machine needing to stand up the same infra) — at that point codify what's already proven to work, rather than designing IaC speculatively now. When that day comes, the shape is still: `data-stack` (RDS + S3 + Secrets), `realtime-stack` (ECS, skeleton below), `observability-stack` (CloudWatch dashboards + alarms, see §5).

```ts
// infra/aws/stacks/realtime-stack.ts (future skeleton, not built yet)
import * as cdk from 'aws-cdk-lib'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns'

export class RealtimeStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: { vpc, db, secrets }) {
    super(scope, id, props)
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc: props.vpc })
    new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'RealtimeService', {
      cluster,
      desiredCount: 1,
      cpu: 512,
      memoryLimitMiB: 1024,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset('../../services/realtime'),
        containerPort: 1234,
        environment: { /* DATABASE_URL via secret */ },
        secrets: { /* JWT secret etc. */ },
      },
      publicLoadBalancer: true,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
      certificate: props.cert,
    })
    // Sticky sessions for Yjs:
    // service.targetGroup.enableCookieStickiness(cdk.Duration.hours(1))
  }
}
```

## 4. Environment variables — the canonical contract

```
# .env.example

# ---- Public (NEXT_PUBLIC_) — safe in browser ----
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_HOCUSPOCUS_URL=ws://localhost:1234
NEXT_PUBLIC_MAPBOX_TOKEN=pk.<token-restricted-to-domain>
NEXT_PUBLIC_LOCATION_INTERVAL_SEC=60

# ---- Server-only ----
DATABASE_URL=postgresql://tripi:tripi@localhost:5432/tripi
BETTER_AUTH_SECRET=replace-me                           # generate with `openssl rand -hex 32`
HOCUSPOCUS_JWT_SECRET=replace-me-as-well

GEMINI_API_KEY=...                                       # https://aistudio.google.com
TAVILY_API_KEY=...                                       # https://tavily.com
FOURSQUARE_API_KEY=...                                   # https://developer.foursquare.com
MAPBOX_SECRET_TOKEN=sk....                               # for upload tooling, optional

S3_BUCKET=tripi-dev
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000                        # MinIO in dev; remove in prod
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio12345

SES_REGION=us-east-1
SES_FROM=Tripi <hello@example.com>

# Feature flags
ENABLE_AI=true
ENABLE_LOCATION_SHARE=true
```

`packages/config/src/env.ts` runs Zod validation at boot:

```ts
import { z } from 'zod'

const Env = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  HOCUSPOCUS_JWT_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().min(8),
  TAVILY_API_KEY: z.string().min(8),
  FOURSQUARE_API_KEY: z.string().min(8),
  S3_BUCKET: z.string(),
  ...
  ENABLE_AI: z.enum(['true', 'false']).transform(v => v === 'true').default('true'),
})

export const env = Env.parse(process.env)
```

Boot fails loudly if anything's missing. No silent runtime crashes.

## 5. Observability — **[v1: minimal]**

### 5.1 Logs
- App logs → AWS CloudWatch Logs — this comes free/default with Amplify and ECS Fargate, no setup required.
- Structured JSON via `pino` is still worth doing from day one (cheap, makes logs greppable): `level, time, msg, userId?, tripId?, path?, durationMs?, err?`.
- Default retention is fine for v1; don't bother tuning it yet.

### 5.2 Errors
One free client-side error tracker — [Highlight.io](https://highlight.io) free tier or Sentry free — with PII scrubbing on, never capturing form values. This is the one piece of "observability" worth having from day one, because otherwise a bug a real collaborator hits is invisible to you.

### 5.3 Deferred until multi-user/public launch actually approaches
- **Custom metrics** (OpenTelemetry SDK, `tripi.*` counters/histograms) — CloudWatch's default request/error metrics from Amplify and ECS are enough to eyeball while it's just you and a few invited users.
- **Dashboards** — a single CloudWatch dashboard is worth building once there's more than one person's traffic to make sense of.
- **Alarms/paging** — no PagerDuty, no "page the founder" for v1; check things by hand. Build real alarms (5xx rate, p95 latency, realtime persist failures, AI/Foursquare cost thresholds) before inviting people beyond a small trusted circle.

The metric names and alarm thresholds from the earlier draft are still the right ones to reach for later — just not now:
`http.request_duration`, `trpc.procedure_duration`, `realtime.connections_open`, `realtime.persist_failures`, `ai.generations`, `ai.cost_usd_estimated`, `foursquare.calls`, `tavily.calls`, `mapbox.tile_loads`.

## 6. Backups — **[v1: rely on defaults]**

| Resource | Strategy | Retention |
|---|---|---|
| RDS Postgres | Automated daily snapshots (RDS default — enable on creation, nothing to build) | 7 days |
| S3 (images) | Versioning enabled | indefinite |
| Yjs binary state | Lives in `trip.yjsState` column → covered by the RDS snapshot above | same |
| `location_share` | Not backed up long-term; ephemeral by design (§14 of `security.md`) | 24h after trip |

That's it for v1 — RDS's built-in daily snapshot is a real, working backup with zero extra engineering. Manual pre-migration snapshots, a formal `docs/runbooks/restore-from-backup.md`, and a quarterly restore drill are worth doing once there's data you'd genuinely be upset to lose (i.e., once someone besides you is trusting it with a real trip).

## 7. Cost ladder (roughly)

Free / near-zero during POC, scales linearly with usage.

| Stage | Users | Monthly cost |
|---|---|---|
| POC (local-only, AWS basics) | 0–10 | ~$0 (S3 5GB free, Postgres free if RDS t4g.micro free tier, Amplify free tier) |
| Soft launch | 10–100 | ~$30 (RDS t4g.small ~$13, Fargate 1 task ~$10, Amplify slight overage, SES tiny) |
| Public launch (early) | 100–2K | ~$150 (RDS db.t4g.medium ~$50, 2 Fargate tasks ~$20, S3 ~$5, NAT gateway ~$32, ALB ~$20, observability ~$15, AI overage ~$10) |
| Growth | 2K–20K | ~$700 (RDS reserved, ALB+Fargate scaled, AI cost dominant) |
| Scale | 20K+ | $$$ — re-architect (move to provisioned Aurora, Redis cache, CDN tier) |

We hit Mapbox + Foursquare paid tiers somewhere around 2K active users; budget another ~$100/mo when that lands.

## 8. Runbooks — **[v1: deferred]**

No runbooks written yet — for a solo build, the person hitting the incident and the person who'd read the runbook are the same person with full context, so a written runbook adds little until that's no longer true (a second person, or enough time passed that you'd forget the details yourself). Write these the first time each situation actually happens, not speculatively:

`docs/runbooks/`: `restore-from-backup.md` · `rotate-secrets.md` · `scale-realtime.md` · `db-migration-rollback.md` · `incident-response.md` · `cost-spike-triage.md`

Shape when written: **Symptoms · Diagnosis · Action · Verification · Post-mortem template.**

## 9. Local quality gates

A pre-commit hook (`lefthook` or `husky` — pick one in Phase 0) runs:
- `pnpm typecheck` (changed packages only, via Turbo)
- `pnpm lint` (changed files)
- `pnpm test --changed`

CI is the source of truth, but pre-commit catches the obvious in 5 seconds.

## 10. Release cadence

- **POC:** continuous deploy on merge to main. No formal releases.
- **Soft launch:** continuous deploy + a daily "release notes" email to internal team.
- **Public:** continuous deploy + bi-weekly user-facing changelog at `/changelog`.

We don't do semver releases; the app is a website, not a library.

## 11. On-call — **[v1: not applicable]**

No formal on-call for a solo, not-yet-launched product — there's no one to page but you, and you'll notice if it's broken because you're the one using it. Revisit (weekly rotation with backup, PagerDuty free tier) before public launch.

## 12. What we are *not* doing in v1

| Skipped | Why | Add when |
|---|---|---|
| Blue/green deploys | Amplify + ECS rolling deploys are fine for our scale | Multi-region |
| Canary releases | Same | After PMF |
| Chaos engineering | We're not Netflix | Never, probably |
| K8s | ECS Fargate is enough for two services | When we have 5+ services |
| Service mesh | One service can't have a mesh | Same |
| Full multi-region | Latency is fine from us-east-1 | When EU users complain |
| Read replicas | Single DB handles 2K users easily | When p95 query latency > 200ms |
