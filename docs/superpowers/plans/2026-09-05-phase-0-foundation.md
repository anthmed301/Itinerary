# Tripi Phase 0 — Foundation Implementation Plan

> **Revision 2 — 2026-09-05.** Every finding in `docs/plan-review-phase-0-2026-09-05.md` has been applied (§3 blockers, §4 high-priority, §5 medium/low). Three of the review's own claims were re-probed while revising and two of its patches were wrong; see **Revision log** below. This revision is executable.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Tripi monorepo so that a browser page renders, calls tRPC, reads Postgres through Drizzle, and a second browser tab proves a Yjs value syncs through a self-hosted Hocuspocus server — all of it green in CI, and all of it green from a **production build**, not just from dev servers.

**Architecture:** Three workspace units instead of the eight in `docs/architecture.md` §2 (see `docs/prd-review-2026-09-05.md` §6.1). `apps/web` is the Next.js app and owns all UI, tRPC, and server modules. `services/realtime` is the Hocuspocus server. `packages/shared` holds the three things both must agree on: the Drizzle schema, the Yjs document shape, and the Zod-validated env contract. Postgres, MinIO, and Mailpit run in Docker; both Node services run on the host with hot reload (review §6.2).

**Tech Stack:** Node 24 LTS · pnpm 11 · Turborepo 2 · TypeScript 7 · Next.js 16 (App Router) · React 19.2 · Tailwind CSS 4 · tRPC 11 · Drizzle ORM 0.45 · Postgres 17 · Yjs 13 · Hocuspocus 4 · Zod 4 · Biome 2 · Vitest 4 · Playwright 1.62 · Lefthook 2 · tsdown 0.22

**Decisions this plan encodes:** version policy over "latest" · full vertical slice · Biome over ESLint+Prettier · Yjs as the only content write path (PRD §4.3) · days positional (PRD §4.2) · server/client boundary enforced by lint, not prose.

---

## Revision log

Where each review finding landed, and what changed about it.

| Review § | Finding | Applied in |
|---|---|---|
| §3.1 | Next never reads root `.env.local` | Task 2 Step 3 + Task 5 Step 2 (symlink), Task 1 Step 8 (preflight check), Task 9 Step 6 (no silent fallback), Task 12 (README) |
| §3.2 | Client components pull the Postgres driver into the browser bundle | Task 1 Step 6 (Biome `noRestrictedImports`), Task 3 Step 1 (exports map), Task 4 Step 4 (barrel stays browser-safe) |
| §3.3 | Realtime production path is broken and never exercised | Task 8 Steps 1–3 (tsdown), Task 10 Step 1 (e2e against `pnpm start` in CI), Task 11 Step 5 (CI build), Definition of done |
| §4.1 | Collab test races the initial sync | Task 9 Step 6/7 (`synced` state), Task 10 Step 4 |
| §4.2 | Definition of done is dev-only | Definition of done |
| §4.3 | Dependency freshness | Version lockfile (vitest 4.1.11, `@types/node` 24.13.3, version policy) |
| §4.4 | Config leaks (duplicate secret, silent default, one schema for two services, dev-reload pool leak) | Task 2 Step 3, Task 3 Step 5, Task 4 Steps 2–3 |
| §4.5 | Unpinned Docker images, MinIO frozen | Task 2 Step 1, deviations table |
| §4.6 | PRD goal cell edited instead of decided | Task 12 Steps 2–3 |
| §4.7 | Task 0 encodes the machine; commits a retired file | Task 0 (rewritten), Task 1 Step 8 (`preflight.mjs` moved here from Task 11) |
| §4.8 | Stub auth has no production guard | Task 8 Step 3 |
| M1–M12 | Medium/low | tsconfig includes + `next typegen` (Task 5), health `try/catch` (Task 6), CI `pnpm/action-setup` (Task 11), lefthook filter (Task 11), `doublePrecision` (Task 4), `pino` removed from web (Task 5), deviations rows (Task 12), LWW comment (Task 9), `declaration: false` (Task 1), `next-env.d.ts` (Task 1), CI concurrency (Task 11), Task 6/9 stubs merged (Tasks 6–9) |

### Corrections to the review

Three of the review's claims were re-probed on 2026-09-05 while applying it. Probes are in **Verification probes** at the end of this plan.

1. **§3.3's tsdown command does not work.** `tsdown … --no-external @tripi/shared` — that flag does not exist in tsdown. The nearest CLI flag, `--deps.always-bundle`, is accepted without error and **silently does nothing**: the build succeeds, `@tripi/shared` stays external, and the artefact crashes with the exact `ERR_MODULE_NOT_FOUND` the patch was meant to fix. Only the config-file form works. This plan uses `tsdown.config.ts` with `deps: { alwaysBundle: ['@tripi/shared'] }` (probe P3).
2. **§3.3's tsdown version violates §4.3's own policy.** `tsdown@0.23.0` was published 2026-09-03 — two days old, zero patches. `0.22.14` (2026-07-23, six weeks old) is what the policy in §4.3 selects. Pinned to `0.22.14`.
3. **§4.7's premise is half wrong.** It says Task 0's Node claim is stale because 24.20.0 is installed. 24.20.0 *is* installed under nvm, but the **active** `node` is still v23.6.0 from Homebrew and **pnpm is not installed at all**. Task 0 still has real work; it just no longer asserts machine state in prose. The check moves to `pnpm preflight`, which moves from Task 11 to Task 1 so it exists before anything needs it.

§3.1, §3.2, M1 and §4.5 were each independently confirmed (probes P1, P2, P4, P5).

---

## Version lockfile

Every version below was resolved from the npm registry on 2026-09-05. Pin these exactly — no carets.

**Selection policy** (rubric row 8, replaces "latest stable"): pin the newest release that is **at least two weeks old and has at least one patch on its major**, unless this plan names the fallback and the step that would reveal the failure. Type packages track the **runtime** major. Container images are pinned to a tag, never `latest`.

| Package | Version | Note |
|---|---|---|
| node | 24 (LTS) | Hocuspocus 4 needs ≥22; Next 16 needs ≥20.9 |
| pnpm | 11.25.0 | via corepack |
| turbo | 2.10.12 | |
| typescript | 7.0.2 | Go-based compiler. **Kept** despite being a new major: review §4.3 verified `next@16.3.4` detects TS 7 and shells out to its CLI (`dist/lib/typescript/runTypeScriptCli.js`). Fallback named in Task 1 Step 9 |
| next | 16.3.4 | `middleware.ts` is now `proxy.ts`; `params` is a Promise |
| react / react-dom | 19.2.8 | |
| @types/react | 19.2.18 | |
| @types/react-dom | 19.2.7 | |
| tailwindcss | 4.3.3 | |
| @tailwindcss/postcss | 4.3.3 | |
| @trpc/server / @trpc/client | 11.18.0 | |
| superjson | 2.2.6 | Date serialization over tRPC |
| drizzle-orm | 0.45.2 | |
| drizzle-kit | 0.31.10 | |
| postgres | 3.4.9 | the `postgres` driver, not `pg` |
| zod | 4.5.4 | |
| yjs | 13.6.32 | |
| @hocuspocus/server | 4.6.0 | |
| @hocuspocus/provider | 4.6.0 | |
| @biomejs/biome | 2.5.12 | |
| **vitest** | **4.1.11** | ⬇ was 5.0.0. Vitest 5 shipped 2026-09-03 with no patch; policy selects the previous stable. Bump when 5.0.x lands |
| **@playwright/test** | **1.62.1** | ⬇ was 1.63.0. **pnpm 11 enforces the age policy itself**: it ships a default `minimumReleaseAge` gate, rejected 1.63.0 (published 2026-09-04) on install, and silently wrote a `minimumReleaseAgeExclude` block into `pnpm-workspace.yaml` to let it through. An auto-written exception defeats the gate, so the plan takes the fallback it had already named. 1.62.1 (2026-07-30) passes the gate with no exclusion list to maintain |
| lefthook | 2.1.12 | |
| tsx | 4.23.13 | |
| **tsdown** | **0.22.14** | ➕ new. Bundles `services/realtime` so its artefact is self-contained (§3.3). `0.23.0` is two days old; policy selects `0.22.14` |
| pino | 10.3.1 | `services/realtime` only — removed from `apps/web`, where nothing imported it (M6) |
| **@types/node** | **24.13.3** | ⬇ was 26.4.1. Types must match the runtime major, or the compiler accepts Node 26 APIs that do not exist on Node 24 |

### Container images

| Image | Tag | Note |
|---|---|---|
| postgres | `17.11-alpine` (local), `17.11` (CI service) | |
| axllent/mailpit | `v1.31` | published 2026-08-22 |
| minio/minio | `RELEASE.2025-09-07T16-13-09Z` | **Frozen.** Last publish 2025-09-07; community edition is in maintenance. Works as an S3 mock, so not blocking. Revisit at Phase 1 when uploads land — candidates: RustFS, Garage, LocalStack S3. Deviations table carries this |

---

## File structure

```
Itinerary/                          (repo root; dir rename to tripi deferred)
  package.json                      workspaces, turbo scripts, packageManager
  pnpm-workspace.yaml
  turbo.json                        dev/build/start/test/typecheck pipeline
  tsconfig.base.json                shared compiler options
  biome.json                        lint + format + the server/client boundary
  lefthook.yml                      pre-commit gate
  .nvmrc                            24
  .gitignore
  .env.example                      canonical env contract
  .env.local                        gitignored, created by setup
  docker-compose.yml                postgres + minio + mailpit, pinned tags
  scripts/preflight.mjs             preflight checks (Task 1)
  .github/workflows/ci.yml          single workflow

  packages/shared/                  the contract both services import
    package.json
    tsconfig.json
    drizzle.config.ts
    migrations/                     generated SQL, committed
    src/
      index.ts                      barrel — BROWSER-SAFE ONLY
      env.ts                        Zod env schemas: core / web / realtime
      env.test.ts
      db/
        client.ts                   Drizzle client factory      (@tripi/shared/db)
        schema.ts                   Drizzle tables (Phase 0: place)
      yjs/
        schema.ts                   Y.Doc shape helpers         (@tripi/shared/yjs)
        schema.test.ts

  apps/web/                         Next.js app
    package.json
    tsconfig.json
    next.config.ts
    postcss.config.mjs
    playwright.config.ts
    .env.local                      symlink -> ../../.env.local, gitignored
    src/
      app/
        layout.tsx
        page.tsx                    server component; grows across Tasks 6/7/9
        globals.css
        api/trpc/[trpc]/route.ts    fetch adapter
      server/trpc/
        init.ts                     context + procedure builders
        root.ts                     appRouter + createCaller
        routers/health.ts           health.check reads Postgres
      lib/
        trpc-client.ts              browser tRPC client
        use-trip-doc.ts             Yjs provider hook
      components/
        HealthProbe.tsx             client; proves browser -> tRPC HTTP
        RealtimeCounter.tsx         client; proves Yjs round trip
    tests/e2e/
      smoke.spec.ts                 page renders, DB health OK
      collab.spec.ts                two tabs, one Yjs value

  services/realtime/                Hocuspocus server
    package.json
    tsconfig.json
    tsdown.config.ts                bundles @tripi/shared into the artefact
    src/server.ts
```

### Responsibility boundaries

These survive into every later phase, and every one of them is enforced by tooling rather than by this paragraph.

| Boundary | Enforced by |
|---|---|
| `packages/shared` imports nothing from `apps/web` or `services/realtime` | No dependency edge in `packages/shared/package.json` |
| Client components import `@tripi/shared` (browser-safe) only. `@tripi/shared/db` and `@tripi/shared/env` are **server-only** | Biome `noRestrictedImports` + `overrides`, Task 1 Step 6 |
| Only `packages/shared/src/db/` contains SQL or table definitions | Subpath export `./db`, `./db/schema` |
| Only `packages/shared/src/yjs/schema.ts` defines the Y.Doc shape | Subpath export `./yjs` |
| `apps/web/src/server/` is server-only; client components import from `apps/web/src/lib/` | Biome override list names the server directories |

Note on `server-only`: do **not** add the `server-only` package inside `packages/shared`. It throws on import outside a React Server environment, which would break `services/realtime` (review §3.2).

---

## Task 0: Prerequisites

Not code — environment. Do this first or every later task fails confusingly.

This task activates a toolchain; it does **not** describe your machine. Anything that inspects the machine belongs in `pnpm preflight` (Task 1 Step 8).

**Files:** delete `PLAN.md`

- [ ] **Step 1: Activate Node 24**

nvm is installed. Both commands are idempotent — run them whether or not 24 is already present.

```bash
nvm install 24
nvm use 24
node -v
```

Expected: `v24.x.x`. If it prints anything else, stop — the shell is still on another Node and every later step will install against the wrong runtime.

> Your login shell may default to a Homebrew Node. `nvm use 24` is per-shell; run it in every terminal you use for this project, or add `.nvmrc` auto-switching to your shell profile. Task 1 writes the `.nvmrc` that makes a bare `nvm use` work.

- [ ] **Step 2: Enable pnpm through corepack**

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm -v
```

Expected: `11.25.0`

- [ ] **Step 3: Confirm the Docker daemon is reachable**

```bash
docker info >/dev/null 2>&1 && echo "daemon up" || echo "daemon DOWN — start Docker Desktop"
```

Expected: `daemon up`.

- [ ] **Step 4: Land the existing docs work and delete the retired plan**

`CLAUDE.md` calls `PLAN.md` retired and `PRD.md` holds its content, so it is deleted rather than committed (review §4.7).

```bash
rm PLAN.md
git add PRD.md CLAUDE.md docs/
git commit -m "docs: PRD review, stage gates, plan review rubric, and phase 0 plan

Retires PLAN.md; PRD.md is the product source of truth."
```

Verify the tree is clean apart from ignored files:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 5: Branch for the scaffold**

```bash
git checkout -b phase-0-foundation
```

A worktree is unnecessary here — the repo contains only documentation, so there is no in-progress work to isolate from.

---

## Task 1: Repo skeleton and toolchain

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `biome.json`, `.nvmrc`, `.gitignore`, `scripts/preflight.mjs`

- [ ] **Step 1: Write `.nvmrc`**

```
24
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'

# pnpm 11 requires explicit approval for dependency install scripts. Each of
# these downloads or compiles a native binary at install time; without approval
# the package installs but its executable does not exist.
#   lefthook  — git hook runner binary (pre-commit gate, Task 1)
#   esbuild   — native bundler binary used by vitest and drizzle-kit
allowBuilds:
  esbuild: true
  lefthook: true
```

> `allowBuilds` is a pnpm 11 requirement, not an optional hardening step. An unapproved package installs but its binary does not, and `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS` after appending `<name>: set this to true or false` to this file. `esbuild` is listed here even though nothing needs it until Task 3, because it arrives as a transitive dependency of both vitest and drizzle-kit and would otherwise stop that install too. Writing both up front skips two round trips.

- [ ] **Step 3: Write root `package.json`**

`start` is new (review §3.3): the production path is a first-class script from Phase 0, not something discovered at Stage 2. `db:up` uses `--wait` so `db:migrate` can follow immediately, which lets `db:reset` drop its `sleep` (§4.5).

```json
{
  "name": "tripi",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.25.0",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "start": "turbo run start",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "biome check .",
    "format": "biome check --write .",
    "preflight": "node scripts/preflight.mjs",
    "db:up": "docker compose up -d --wait",
    "db:down": "docker compose down",
    "db:reset": "docker compose down -v && pnpm db:up && pnpm db:migrate",
    "db:generate": "pnpm --filter @tripi/shared db:generate",
    "db:migrate": "pnpm --filter @tripi/shared db:migrate",
    "e2e": "pnpm --filter @tripi/web e2e"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.12",
    "@types/node": "24.13.3",
    "lefthook": "2.1.12",
    "turbo": "2.10.12",
    "typescript": "7.0.2"
  }
}
```

- [ ] **Step 4: Write `turbo.json`**

`dev` and `start` are both persistent and uncached. `start` depends on `build` so `pnpm start` can never serve a stale or missing artefact — this is what makes the CI e2e run in Task 10 meaningful.

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "start": {
      "dependsOn": ["build"],
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 5: Write `tsconfig.base.json`**

`declaration` is `false` here rather than `true`-then-overridden-twice (M9): nothing in this repo consumes `.d.ts` files, because `packages/shared` exports TypeScript source.

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "declaration": false,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 6: Write `biome.json`**

`files.includes` excludes `packages/shared/migrations`, which drizzle-kit generates (Task 4). Biome reformats its `meta/*.json` files; `db:generate` writes them back unformatted; CI then fails on a file no human touched. Never lint generated output. Note the pattern has **no trailing `/**`** — since Biome 2.2 that form is wrong, and Biome lints its own config to tell you so.

The `linter.rules.style.noRestrictedImports` block plus the `overrides` array is the **server/client boundary** (review §3.2). Without it, a `'use client'` component can import `@tripi/shared/db`, drag `postgres` and `drizzle-orm/postgres-js` into the browser bundle, and fail the Turbopack build on `net`/`tls` resolution — with a stack trace that points at the bundler rather than at the import.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.12/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true,
    "includes": ["**", "!packages/shared/migrations"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "@tripi/shared/db": "Server-only. Import it from apps/web/src/server/**, apps/web/src/app/api/**, or services/realtime/**.",
              "@tripi/shared/db/schema": "Server-only. Import it from apps/web/src/server/**, apps/web/src/app/api/**, or services/realtime/**.",
              "@tripi/shared/env": "Server-only. Import it from apps/web/src/server/**, apps/web/src/app/api/**, or services/realtime/**."
            }
          }
        }
      }
    }
  },
  "overrides": [
    {
      "includes": [
        "apps/web/src/server/**",
        "apps/web/src/app/api/**",
        "services/realtime/**",
        "packages/shared/**"
      ],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": "off"
          }
        }
      }
    }
  ]
}
```

- [ ] **Step 7: Write `.gitignore`**

The bare `.env.local` pattern matches at **any** depth, so it already covers the `apps/web/.env.local` symlink that Task 5 creates. `next-env.d.ts` is generated by Next 16 (M10).

```
node_modules/
.next/
dist/
out/
.turbo/
coverage/
test-results/
playwright-report/
.env
.env.local
.env.*.local
apps/web/next-env.d.ts
*.log
.DS_Store
```

- [ ] **Step 8: Write `scripts/preflight.mjs`**

Moved here from Task 11 (review §4.7) so that machine state has a home from the first task onward. Plans describe the target; `preflight` describes the machine.

> **Why `preflight` and not `doctor`.** pnpm 11 ships a **built-in `pnpm doctor`** command, and a built-in wins over a same-named `package.json` script. A `"doctor"` script therefore looks installed and never runs: `pnpm doctor` silently prints pnpm's own registry/store diagnostics, exits 0, and every check in this file is skipped. Only `pnpm run doctor` would reach it. Found during execution on 2026-09-05 — the first `pnpm doctor` run returned "All checks passed" while `.env.local` did not exist. Do not rename this back.

The `apps/web/.env.local` check uses `existsSync`, which **follows symlinks** — so it fails on a dangling link, which is exactly the failure mode §3.1 produces. It is skipped until `apps/web` exists, so this script is useful from Task 1 through Phase 9.

```js
#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'

const checks = []

function record(name, ok, detail) {
  checks.push({ name, ok, detail })
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.setTimeout(700)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

const major = Number(process.versions.node.split('.')[0])
record('node >= 24', major >= 24, `found ${process.versions.node} — run \`nvm use\``)

record('.env.local exists', existsSync('.env.local'), 'cp .env.example .env.local')

// Next reads .env.local from the directory it was started in, never from the repo
// root, so apps/web needs its own link to the canonical file. See review §3.1.
if (existsSync('apps/web')) {
  record(
    'apps/web/.env.local resolves',
    existsSync('apps/web/.env.local'),
    'ln -s ../../.env.local apps/web/.env.local',
  )
}

try {
  execSync('docker info', { stdio: 'ignore' })
  record('docker daemon', true, '')
} catch {
  record('docker daemon', false, 'start Docker Desktop')
}

record('postgres :5433', await portOpen(5433), 'run pnpm db:up')
record('mailpit :8025', await portOpen(8025), 'run pnpm db:up')

for (const { name, ok, detail } of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

process.exit(checks.every((c) => c.ok) ? 0 : 1)
```

- [ ] **Step 9: Install and verify the toolchain**

```bash
pnpm install
pnpm exec tsc --version
pnpm exec biome --version
pnpm exec turbo --version
```

Expected: `Version 7.0.2`, a Biome version line reading `2.5.12`, and `2.10.12`.

> **If `tsc --version` fails or behaves oddly:** TypeScript 7 is the new Go-based compiler and is the newest thing in this stack. Fall back with `pnpm add -Dw typescript@6` at the root and re-run. Nothing else in the plan changes. Record the fallback in `CLAUDE.md` and add a deviations row.

- [ ] **Step 10: Run the preflight check**

```bash
pnpm preflight
```

Expected: `FAIL  .env.local exists` (Task 2 creates it) and `ok` for the rest, exit status 1. This is the correct result at this point — it proves the script detects a real gap rather than rubber-stamping.

- [ ] **Step 11: Write `lefthook.yml` and install the hook**

Moved here from Task 11 during execution. Two reasons, both discovered on the first `pnpm install`:

1. lefthook's postinstall **creates an example `lefthook.yml` whenever one is missing** and re-syncs hooks. Left alone it reappears in `git status` after every install between here and Task 11.
2. Rubric row 10 wants gates to exist before the commits they guard. Installing at Task 1 covers every commit in this phase; installing at Task 11 covers one.

Scoped to changed packages (M4) — a full `pnpm typecheck` on every commit is slow enough to get bypassed with `--no-verify`, and a gate everyone skips is not a gate. With no workspace packages yet, the filtered command matches nothing and exits 0.

```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: '*.{js,jsx,ts,tsx,json,css}'
      run: pnpm exec biome check --write --no-errors-on-unmatched {staged_files}
      stage_fixed: true
    typecheck:
      run: pnpm exec turbo run typecheck --filter=...[HEAD]
```

```bash
pnpm exec lefthook install
```

Expected: `sync hooks: ✔️(pre-commit)`.

- [ ] **Step 12: Commit**

```bash
git add .nvmrc package.json pnpm-workspace.yaml turbo.json tsconfig.base.json biome.json .gitignore lefthook.yml scripts/preflight.mjs pnpm-lock.yaml
git commit -m "chore: monorepo skeleton, pinned toolchain, and preflight script"
```

---

## Task 2: Local infrastructure in Docker

Postgres, MinIO for S3, Mailpit for email. Hocuspocus is deliberately **not** here — it runs on the host with hot reload.

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env.local` (gitignored)

- [ ] **Step 1: Write `docker-compose.yml`**

Images are pinned to exact tags (review §4.5). `latest` in a compose file is the same class of mistake as a caret in `package.json`.

**Host port 5433, not 5432.** A Homebrew `postgresql@17` service owns 5432 on the dev machine — database `album_app`, started by a LaunchAgent at login — so `docker compose up` cannot bind it. Decided 2026-09-05: remap rather than stop the other service, which would break an unrelated project and re-collide on every reboot. CI uses the same mapping so `DATABASE_URL` is byte-identical in both environments; the container's internal port is still 5432, so nothing inside the network changes. Deviations table carries this.

Every service also has a **healthcheck**, including MinIO and Mailpit, which the reviewed draft gave only to Postgres. `db:up` uses `docker compose up -d --wait`, and `--wait` treats a service with no healthcheck as healthy the moment it starts — so without these three, `--wait` returns before the stack is usable and the guarantee that lets `db:reset` drop its `sleep` is fiction.

```yaml
services:
  # Host port 5433, not 5432: a Homebrew postgresql@17 service owns 5432 on the
  # dev machine (database `album_app`) and auto-starts on login. CI uses the same
  # mapping so DATABASE_URL is byte-identical in both environments.
  postgres:
    image: postgres:17.11-alpine
    environment:
      POSTGRES_USER: tripi
      POSTGRES_PASSWORD: tripi
      POSTGRES_DB: tripi
    ports: ['5433:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U tripi -d tripi']
      interval: 5s
      timeout: 3s
      retries: 10

  # Frozen upstream: last published 2025-09-07 (community edition in maintenance).
  # Fine as an S3 mock; revisit at Phase 1 when uploads land. See deviations table.
  minio:
    image: minio/minio:RELEASE.2025-09-07T16-13-09Z
    command: server /data --console-address ':9001'
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio12345
    ports: ['9000:9000', '9001:9001']
    volumes: ['minio:/data']
    healthcheck:
      test: ['CMD-SHELL', 'mc ready local || exit 1']
      interval: 5s
      timeout: 3s
      retries: 10

  mailpit:
    image: axllent/mailpit:v1.31
    ports: ['1025:1025', '8025:8025']
    healthcheck:
      test: ['CMD', '/mailpit', 'readyz']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
  minio:
```

Every service has a healthcheck because `db:up` uses `docker compose up -d --wait`, which waits on healthchecks and returns non-zero if any service never becomes healthy. A service without one is reported healthy immediately, which would defeat the point.

- [ ] **Step 2: Write `.env.example`**

```
# ---- Public (NEXT_PUBLIC_) — safe in the browser ----
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_HOCUSPOCUS_URL=ws://localhost:1234

# ---- Server-only ----
# Postgres from docker-compose
DATABASE_URL=postgresql://tripi:tripi@localhost:5433/tripi

# Realtime server
HOCUSPOCUS_PORT=1234
# replaced with a real value by setup: openssl rand -hex 32
HOCUSPOCUS_JWT_SECRET=replace-me-with-64-hex-chars-from-openssl-rand-hex-32
```

- [ ] **Step 3: Create your local env file**

The secret line is **replaced**, not appended (review §4.4). Appending leaves two `HOCUSPOCUS_JWT_SECRET` lines in the file and which one wins depends on which parser reads it — Node's `--env-file` and a hand-written regex can disagree, and the placeholder is 52 characters, long enough to satisfy `min(32)` and reach production looking valid.

```bash
cp .env.example .env.local
sed -i '' "s|^HOCUSPOCUS_JWT_SECRET=.*|HOCUSPOCUS_JWT_SECRET=$(openssl rand -hex 32)|" .env.local
```

> On Linux the flag is `sed -i` with no `''` argument.

Verify exactly one secret line, and that it is not the placeholder:

```bash
grep -c '^HOCUSPOCUS_JWT_SECRET=' .env.local
grep '^HOCUSPOCUS_JWT_SECRET=' .env.local | grep -c 'replace-me'
```

Expected: `1`, then `0`.

`apps/web` needs its own link to this file — Next never reads the repo root. That link is created in Task 5 Step 2, once `apps/web` exists.

- [ ] **Step 4: Bring the stack up and verify**

```bash
pnpm db:up
docker compose ps
```

`--wait` blocks until every healthcheck passes, so this returns only when the stack is actually usable. Expected: three services listed, all showing `(healthy)`.

```bash
docker compose exec -T postgres psql -U tripi -d tripi -c 'select 1 as ok;'
```

Expected: a table with `ok` = `1`.

Mailpit's inbox is at http://localhost:8025 and MinIO's console at http://localhost:9001 (login `minio` / `minio12345`). Neither is used until Phase 1.

- [ ] **Step 5: Re-run the preflight check**

```bash
pnpm preflight
```

Expected: all checks `ok`, exit status 0. (`apps/web` does not exist yet, so its check is skipped.)

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: pinned local postgres, minio, and mailpit via docker compose"
```

---

## Task 3: Shared package with a validated env contract

TDD starts here. The env schema is real logic with real failure modes, so it gets a test first.

The schema is **split into three** from the start (review §4.4): a core both services need, plus per-service extensions. One combined schema means the realtime server cannot boot without `NEXT_PUBLIC_APP_URL`, which it never uses, and the web app must hold `HOCUSPOCUS_JWT_SECRET` four phases before it needs it. Splitting is thirty lines now and three hundred in Phase 4.

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/env.ts`, `packages/shared/src/env.test.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Write `packages/shared/package.json`**

The exports map is the boundary (review §3.2). `.` is the browser-safe barrel; `./db`, `./db/schema`, and `./env` are server-only and lint-restricted. `./schema` was renamed to `./db/schema` so the word "schema" is not shared between the database and Yjs subpaths.

```json
{
  "name": "@tripi/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./env": "./src/env.ts",
    "./db": "./src/db/client.ts",
    "./db/schema": "./src/db/schema.ts",
    "./yjs": "./src/yjs/schema.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "drizzle-orm": "0.45.2",
    "postgres": "3.4.9",
    "yjs": "13.6.32",
    "zod": "4.5.4"
  },
  "devDependencies": {
    "@types/node": "24.13.3",
    "drizzle-kit": "0.31.10",
    "typescript": "7.0.2",
    "vitest": "4.1.11"
  }
}
```

Source files are exported directly rather than built to `dist`. Next transpiles them via `transpilePackages`, tsx transpiles them in dev, and tsdown bundles them for the realtime production artefact (Task 8) — so there is no build step to wait on during development, and no un-emitted package at runtime.

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "drizzle.config.ts"]
}
```

No `outDir` or `rootDir`: this package is never built by `tsc`. Setting `rootDir: "src"` would also reject `drizzle.config.ts`, which sits outside `src`.

`@types/node` is declared in this package's own devDependencies, not inherited from the root. `"types": ["node"]` would resolve through the parent-directory walk into the root `node_modules` today, but that depends on hoisting rather than on a declared dependency — the kind of thing that works until pnpm's layout changes. Declare what you use.

- [ ] **Step 3: Write the failing test `packages/shared/src/env.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { parseCoreEnv, parseRealtimeEnv, parseWebEnv } from './env'

const core = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://tripi:tripi@localhost:5433/tripi',
}

const web = {
  ...core,
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_HOCUSPOCUS_URL: 'ws://localhost:1234',
}

const realtime = {
  ...core,
  HOCUSPOCUS_PORT: '1234',
  HOCUSPOCUS_JWT_SECRET: 'a'.repeat(64),
}

describe('core env', () => {
  it('accepts a complete environment', () => {
    expect(parseCoreEnv(core).DATABASE_URL).toBe('postgresql://tripi:tripi@localhost:5433/tripi')
  })

  it('defaults NODE_ENV to development', () => {
    const { NODE_ENV, ...withoutNodeEnv } = core
    expect(parseCoreEnv(withoutNodeEnv).NODE_ENV).toBe('development')
  })

  it('throws naming the missing key when DATABASE_URL is absent', () => {
    const { DATABASE_URL, ...withoutDb } = core
    expect(() => parseCoreEnv(withoutDb)).toThrow(/DATABASE_URL/)
  })

  it('rejects a DATABASE_URL that is not a postgres URL', () => {
    expect(() => parseCoreEnv({ ...core, DATABASE_URL: 'mysql://nope' })).toThrow(/DATABASE_URL/)
  })
})

describe('web env', () => {
  it('accepts the web environment', () => {
    expect(parseWebEnv(web).NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000')
  })

  // The web app has no business holding the realtime signing key until Phase 4.
  it('does not require the realtime signing secret', () => {
    expect(() => parseWebEnv(web)).not.toThrow()
  })

  it('rejects a websocket URL that is not a ws URL', () => {
    expect(() => parseWebEnv({ ...web, NEXT_PUBLIC_HOCUSPOCUS_URL: 'http://nope' })).toThrow(
      /NEXT_PUBLIC_HOCUSPOCUS_URL/,
    )
  })
})

describe('realtime env', () => {
  it('coerces the port to a number', () => {
    expect(parseRealtimeEnv(realtime).HOCUSPOCUS_PORT).toBe(1234)
  })

  it('defaults the port when absent', () => {
    const { HOCUSPOCUS_PORT, ...withoutPort } = realtime
    expect(parseRealtimeEnv(withoutPort).HOCUSPOCUS_PORT).toBe(1234)
  })

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => parseRealtimeEnv({ ...realtime, HOCUSPOCUS_JWT_SECRET: 'short' })).toThrow(
      /HOCUSPOCUS_JWT_SECRET/,
    )
  })

  // The realtime server never renders a page; requiring the app URL would block boot.
  it('does not require the public app URL', () => {
    expect(() => parseRealtimeEnv(realtime)).not.toThrow()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
pnpm --filter @tripi/shared test
```

Expected: FAIL, `Failed to resolve import "./env"`.

- [ ] **Step 5: Write `packages/shared/src/env.ts`**

```ts
import { z } from 'zod'

/** Everything both services need. */
const coreShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().startsWith('postgres'),
}

const CoreEnvSchema = z.object(coreShape)

const WebEnvSchema = z.object({
  ...coreShape,
  NEXT_PUBLIC_APP_URL: z.string().startsWith('http'),
  NEXT_PUBLIC_HOCUSPOCUS_URL: z.string().startsWith('ws'),
})

const RealtimeEnvSchema = z.object({
  ...coreShape,
  HOCUSPOCUS_PORT: z.coerce.number().int().positive().default(1234),
  HOCUSPOCUS_JWT_SECRET: z.string().min(32),
})

export type CoreEnv = z.infer<typeof CoreEnvSchema>
export type WebEnv = z.infer<typeof WebEnvSchema>
export type RealtimeEnv = z.infer<typeof RealtimeEnvSchema>

/**
 * Parses an environment record, throwing an error that names every offending key.
 * Exported through the three named parsers so tests can exercise them without
 * touching process.env.
 */
function parse<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
  label: string,
): z.infer<T> {
  const result = schema.safeParse(source)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  ')
    throw new Error(`Invalid ${label} environment:\n  ${detail}`)
  }
  return result.data
}

export const parseCoreEnv = (source: Record<string, string | undefined>): CoreEnv =>
  parse(CoreEnvSchema, source, 'core')

export const parseWebEnv = (source: Record<string, string | undefined>): WebEnv =>
  parse(WebEnvSchema, source, 'web')

export const parseRealtimeEnv = (source: Record<string, string | undefined>): RealtimeEnv =>
  parse(RealtimeEnvSchema, source, 'realtime')

let coreCache: CoreEnv | undefined
let webCache: WebEnv | undefined
let realtimeCache: RealtimeEnv | undefined

/**
 * Lazily validated process env. These are functions rather than top-level
 * constants so that importing this module during a Next build does not throw
 * before the runtime environment exists.
 *
 * All three read server-side process.env and are therefore server-only —
 * biome.json restricts `@tripi/shared/env` to server directories.
 */
export function coreEnv(): CoreEnv {
  coreCache ??= parseCoreEnv(process.env)
  return coreCache
}

export function webEnv(): WebEnv {
  webCache ??= parseWebEnv(process.env)
  return webCache
}

export function realtimeEnv(): RealtimeEnv {
  realtimeCache ??= parseRealtimeEnv(process.env)
  return realtimeCache
}
```

- [ ] **Step 6: Write `packages/shared/src/index.ts`**

This barrel is **browser-safe**. It must never re-export anything from `./env` or `./db/` — that is what put the Postgres driver in the browser bundle in the reviewed draft (§3.2). It stays empty-ish until Task 9 adds the Yjs helpers.

```ts
// Browser-safe barrel. Server-only modules are reached through their subpaths:
//   @tripi/shared/env       Zod-validated process env
//   @tripi/shared/db        Drizzle client
//   @tripi/shared/db/schema Drizzle tables
// biome.json enforces that restriction; see the boundaries table in the plan.
export type { CoreEnv, RealtimeEnv, WebEnv } from './env'
```

Types are safe to re-export: `verbatimModuleSyntax` plus `export type` means the import is erased at compile time and no runtime edge is created.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm --filter @tripi/shared test
```

Expected: PASS, 11 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): split Zod environment contract for core, web, and realtime"
```

---

## Task 4: Drizzle client, first table, first migration

Phase 0 creates `place` because it is the only table in `docs/data-model.md` with no foreign keys — it does not depend on Better Auth's `user` table, which does not exist until Phase 1. It is permanent and needed in Phase 2.

Two deviations from `docs/data-model.md`, both recorded in the deviations table: `refreshed_at` carries a comment recording the 24-hour Foursquare caching limit (`docs/prd-review-2026-09-05.md` §2.4), and `lat`/`lng` are `doublePrecision` rather than `decimal` (M5).

**Files:**
- Create: `packages/shared/src/db/schema.ts`, `packages/shared/src/db/client.ts`, `packages/shared/drizzle.config.ts`

- [ ] **Step 1: Write `packages/shared/src/db/schema.ts`**

```ts
import { sql } from 'drizzle-orm'
import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Foursquare-backed place cache, shared across activities.
 *
 * Foursquare's usage terms allow storing `fsq_id` indefinitely but limit cached
 * POI metadata (name, address, hours, coordinates) to 24 hours. `refreshedAt`
 * drives refresh-on-read. See docs/prd-review-2026-09-05.md §2.4.
 *
 * lat/lng are doublePrecision, not decimal: Drizzle returns `decimal` columns as
 * strings, so every map pin would need Number() at the call site. Coordinates are
 * a measurement, not money — float is the right type. Deviates from
 * docs/data-model.md §2.3; see the deviations table.
 */
export const place = pgTable(
  'place',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fsqId: varchar('fsq_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    category: varchar('category', { length: 100 }),
    address: text('address'),
    city: varchar('city', { length: 120 }),
    country: varchar('country', { length: 80 }),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('place_fsq_id_idx').on(t.fsqId),
    index('place_refreshed_at_idx').on(t.refreshedAt),
  ],
)

export type Place = typeof place.$inferSelect
export type NewPlace = typeof place.$inferInsert

/** Rows whose cached metadata has aged past the Foursquare 24h limit. */
export const placeIsStale = sql`${place.refreshedAt} < now() - interval '24 hours'`
```

Drizzle 0.45 expects the table extras callback to return an **array**, not an object. The object form in `docs/data-model.md` is the older API and will not compile.

- [ ] **Step 2: Write `packages/shared/src/db/client.ts`**

The singleton is stashed on `globalThis` in non-production (review §4.4). A plain module-level variable is re-created every time Next re-evaluates the module during hot reload, so each save leaks one connection; Postgres' default `max_connections` is 100, and you hit it after an afternoon of editing.

```ts
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { coreEnv } from '../env'
import * as schema from './schema'
import { place } from './schema'

export type Database = ReturnType<typeof createDb>

/** Creates a Drizzle client. `max: 1` suits serverless; the realtime server overrides it. */
export function createDb(connectionString: string = coreEnv().DATABASE_URL, max = 1) {
  const client = postgres(connectionString, { max })
  return drizzle(client, { schema })
}

// Next re-evaluates modules on every hot reload, so a module-scoped variable does
// not survive one. globalThis does. Production gets a plain module singleton
// because there is no reload to survive.
const globalForDb = globalThis as typeof globalThis & { __tripiDb?: Database }

let cached: Database | undefined

export function db(): Database {
  if (process.env.NODE_ENV === 'production') {
    cached ??= createDb()
    return cached
  }
  globalForDb.__tripiDb ??= createDb()
  return globalForDb.__tripiDb
}

/**
 * Row count of the place cache.
 *
 * Lives here rather than in a tRPC router so that `drizzle-orm` and the `sql`
 * template stay inside packages/shared/src/db — the boundary says only this
 * directory contains SQL. A router that imports `sql` directly also forces
 * `drizzle-orm` into apps/web's dependencies, where it does not belong.
 */
export async function countPlaces(database: Database): Promise<number> {
  const rows = await database.select({ count: sql<number>`count(*)::int` }).from(place)
  // rows.at(0) rather than destructuring because noUncheckedIndexedAccess is on.
  return rows.at(0)?.count ?? 0
}

export { schema }
```

- [ ] **Step 3: Write `packages/shared/drizzle.config.ts`**

The hard-coded localhost fallback is **deleted** (review §4.4). If the regex misses — a quoted value, CRLF line endings, a renamed file — the old version silently migrated whatever database happened to be listening on that port. Failing loudly is the whole point of an env contract.

```ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit runs outside Next and outside tsx, so nothing has loaded
 * .env.local for us. Read it here so `pnpm db:migrate` works with no
 * inline environment variable, matching what the README tells you to run.
 * CI sets DATABASE_URL directly and never reaches the file.
 *
 * There is deliberately no fallback: a migration tool that guesses its target
 * database is a tool that will one day migrate the wrong one.
 */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const path = new URL('../../.env.local', import.meta.url)
  let file: string
  try {
    file = readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `DATABASE_URL is not set and ${path.pathname} could not be read.\n` +
        'Run: cp .env.example .env.local  (see README "Getting started")',
    )
  }

  const match = file.match(/^DATABASE_URL=(.*)$/m)
  const value = match?.[1]?.trim()
  if (!value) {
    throw new Error(`DATABASE_URL is not set and no DATABASE_URL= line was found in ${path.pathname}`)
  }
  return value
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl() },
  strict: true,
  verbose: true,
})
```

- [ ] **Step 4: Leave `packages/shared/src/index.ts` alone**

Deliberate non-change, and the single most important line in this task. The reviewed draft added `export { createDb, db, schema } from './db/client'` here, which is what dragged `postgres` and `drizzle-orm/postgres-js` into every client component that imported the barrel (§3.2).

Server code reaches the database through the subpath:

```ts
import { db } from '@tripi/shared/db'
import { place } from '@tripi/shared/db/schema'
```

- [ ] **Step 5: Prove the boundary is enforced, not just documented**

Before generating the migration, confirm the lint rule from Task 1 actually fires. Write a throwaway client file:

```bash
mkdir -p apps/web/src/components
cat > apps/web/src/components/BoundaryProbe.tsx <<'EOF'
'use client'
import { db } from '@tripi/shared/db'
export const probe = db
EOF
pnpm lint
```

Expected: `lint/style/noRestrictedImports` error on `apps/web/src/components/BoundaryProbe.tsx` reading `Server-only. Import it from …`.

If it does **not** error, the boundary is prose again — stop and fix `biome.json` before continuing. Then delete the probe:

```bash
rm apps/web/src/components/BoundaryProbe.tsx
```

- [ ] **Step 6: Generate the first migration**

`drizzle.config.ts` reads `.env.local` itself, so no inline variable is needed.

```bash
pnpm db:generate
```

Expected: a new file under `packages/shared/migrations/0000_*.sql` containing `CREATE TABLE "place"` with `lat`/`lng` as `double precision`.

- [ ] **Step 7: Apply the migration**

```bash
pnpm db:migrate
```

- [ ] **Step 8: Verify the table exists**

```bash
docker compose exec -T postgres psql -U tripi -d tripi -c '\d place'
```

Expected: the column list including `fsq_id`, `refreshed_at`, `lat | double precision`, and the two indexes.

- [ ] **Step 9: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): drizzle client and place table with first migration"
```

---

## Task 5: Next.js 16 app that renders

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/.env.local` (symlink), `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`

- [ ] **Step 1: Write `apps/web/package.json`**

`pino` is absent (M6): nothing in `apps/web` imports it, and when something does, Next will also need `serverExternalPackages: ['pino']` in `next.config.ts`. Add both together in Phase 1, not one now.

`typecheck` runs `next typegen` first (M1) so `.next/types` exists before `tsc` reads it. Without that, CI type-checks a tree whose route types have never been generated.

```json
{
  "name": "@tripi/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@hocuspocus/provider": "4.6.0",
    "@tripi/shared": "workspace:*",
    "@trpc/client": "11.18.0",
    "@trpc/server": "11.18.0",
    "next": "16.3.4",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "superjson": "2.2.6",
    "yjs": "13.6.32",
    "zod": "4.5.4"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "24.13.3",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.7",
    "tailwindcss": "4.3.3",
    "typescript": "7.0.2",
    "vitest": "4.1.11"
  }
}
```

- [ ] **Step 2: Link the env file into the app directory**

This is blocking finding §3.1. Next calls `loadEnvConfig(dir)` where `dir` is the directory `next` was started in — verified in `next@16.3.4` at `dist/esm/server/next-server.js:512` and `dist/esm/server/config.js:1330`. With `next dev` running from `apps/web`, the repo-root `.env.local` **is not read at all**: `DATABASE_URL` is undefined, `coreEnv()` throws `Invalid core environment`, the server component in Task 6 renders an error page instead of `database: up`, and `NEXT_PUBLIC_HOCUSPOCUS_URL` is never inlined into the browser bundle.

CI is unaffected because the workflow's `env:` block puts everything in the process environment — which is precisely why this bug only ever appears on your laptop.

Keep the single root file as the source of truth and give Next a link to it:

```bash
ln -s ../../.env.local apps/web/.env.local
```

Verify the link resolves and carries real content:

```bash
readlink apps/web/.env.local
grep -c '^DATABASE_URL=' apps/web/.env.local
```

Expected: `../../.env.local`, then `1`.

`.gitignore`'s bare `.env.local` pattern matches at any depth, so the link is already ignored — nothing to add. `pnpm preflight` checks it from here on.

> **Alternative if symlinks are a problem** (Windows without developer mode, a filesystem that does not carry them): add `dotenv-cli` and make the script `"dev": "dotenv -e ../../.env.local -- next dev --port 3000"`, repeated for `build` and `start`. The symlink is fewer moving parts and covers all three scripts at once, so it is the default.

- [ ] **Step 3: Write `apps/web/tsconfig.json`**

`include` covers `tests/**`, `playwright.config.ts`, and `next.config.ts` (M1). The reviewed draft omitted all three, so every e2e spec was invisible to `tsc` — a test file could reference a deleted testid helper and CI would stay green.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2023"],
    "jsx": "preserve",
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "next.config.ts",
    "playwright.config.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    "tests/**/*.ts",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

> `"plugins": [{ "name": "next" }]` is a **tsserver** plugin, for editor tooling only. TypeScript 7's native language server may not load it; that is harmless and does not affect `tsc --noEmit` or CI.

- [ ] **Step 4: Write `apps/web/next.config.ts`**

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next must transpile them.
  transpilePackages: ['@tripi/shared'],
  // Next 16 writes apps/web/AGENTS.md and apps/web/CLAUDE.md on first dev run.
  // This repo keeps its agent instructions in the root CLAUDE.md; a generated
  // second copy scoped to apps/web would silently compete with it.
  agentRules: false,
}

export default config
```

> `agentRules: false` is not cosmetic. Next 16 writes `AGENTS.md` **and `CLAUDE.md`** into the app directory on the first `next dev`, announcing it in one line of startup output that is easy to miss. Left alone they get committed, and `apps/web/CLAUDE.md` is then loaded as project instructions for any agent working in that directory — a generated file quietly competing with the curated root `CLAUDE.md`. It does not touch the root file.

- [ ] **Step 5: Write `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

- [ ] **Step 6: Write `apps/web/src/app/globals.css`**

Tailwind 4 uses a single import instead of the three `@tailwind` directives.

```css
@import "tailwindcss";

:root {
  color-scheme: light dark;
}
```

- [ ] **Step 7: Write `apps/web/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tripi',
  description: 'The trip-planning document that replaces the spreadsheet.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 8: Write a placeholder `apps/web/src/app/page.tsx`**

Tasks 6, 7, and 9 each add one section to this file. It exists now so the app boots.

```tsx
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-10">
      <h1 className="text-3xl font-bold">Tripi</h1>
      <p className="text-neutral-600 dark:text-neutral-400">Phase 0 foundation.</p>
    </main>
  )
}
```

- [ ] **Step 9: Install and run**

```bash
pnpm install
pnpm --filter @tripi/web dev
```

Open http://localhost:3000. Expected: the heading "Tripi" in bold, confirming Tailwind 4 compiled. Stop the server with Ctrl+C.

- [ ] **Step 10: Prove the production path works too**

Do this now, at the smallest possible app, so that when `next build` breaks later you know it was the last thing you added (review §3.3 — production parity from Phase 0).

```bash
pnpm --filter @tripi/web build
pnpm --filter @tripi/web start
```

Open http://localhost:3000. Expected: the same page, served from the build. Stop with Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add apps/web
git commit -m "feat(web): Next 16 app router shell with Tailwind 4"
```

---

## Task 6: tRPC server reading Postgres

Per M12, this task renders **only** the server section. The reviewed draft had Task 6 write a full page referencing components from Tasks 7 and 9, then create empty stubs so it would compile, then throw the stubs away. Each task now adds its own section and is independently verifiable.

**Files:**
- Create: `apps/web/src/server/trpc/init.ts`, `apps/web/src/server/trpc/routers/health.ts`, `apps/web/src/server/trpc/root.ts`, `apps/web/src/app/api/trpc/[trpc]/route.ts`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write `apps/web/src/server/trpc/init.ts`**

The import is the **subpath**, not the barrel. This file lives under `apps/web/src/server/`, which `biome.json` lists as allowed.

```ts
import { initTRPC } from '@trpc/server'
import { type Database, db } from '@tripi/shared/db'
import superjson from 'superjson'

export type Context = {
  db: Database
  /** Populated in Phase 1 when Better Auth lands. */
  userId: string | null
}

export async function createContext(): Promise<Context> {
  return { db: db(), userId: null }
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory
```

- [ ] **Step 2: Write `apps/web/src/server/trpc/routers/health.ts`**

The `down` branch is now reachable (M2). In the reviewed draft it could not execute — `count(*)` always returns a row, and a real outage throws before the check, so the RSC page crashed instead of rendering `down`. A handler that looks like it handles failure but does not is worse than one that admits it doesn't.

```ts
import { countPlaces } from '@tripi/shared/db'
import { publicProcedure, router } from '../init'

export const healthRouter = router({
  /**
   * Proves the whole server-side seam: tRPC -> Drizzle -> Postgres.
   * The body is throwaway; the wiring around it is not.
   */
  check: publicProcedure.query(async ({ ctx }) => {
    const checkedAt = new Date()
    try {
      return { database: 'up' as const, placeCount: await countPlaces(ctx.db), checkedAt }
    } catch {
      // Reached when Postgres is unreachable or the migration has not run.
      // The page renders `database: down` instead of a 500.
      return { database: 'down' as const, placeCount: 0, checkedAt }
    }
  }),
})
```

> The query itself lives in `packages/shared/src/db/client.ts` as `countPlaces`, not here. Writing `import { sql } from 'drizzle-orm'` in this file **fails to resolve** under pnpm's strict layout — `drizzle-orm` is a dependency of `packages/shared`, not of `apps/web` — and the fix is *not* to add it to `apps/web`. The boundary table says only `packages/shared/src/db/` contains SQL; a router reaching for the `sql` template is that boundary leaking, and pnpm caught it. Found during execution: `Module not found: Can't resolve 'drizzle-orm'`.

`checkedAt` is a `Date` on purpose — it proves superjson is transporting non-JSON types correctly.

- [ ] **Step 3: Write `apps/web/src/server/trpc/root.ts`**

```ts
import { healthRouter } from './routers/health'
import { createCallerFactory, createContext, router } from './init'

export const appRouter = router({
  health: healthRouter,
})

export type AppRouter = typeof appRouter

const createCaller = createCallerFactory(appRouter)

/** Server-side caller for React Server Components — no HTTP hop. */
export async function serverApi() {
  return createCaller(await createContext())
}
```

- [ ] **Step 4: Write `apps/web/src/app/api/trpc/[trpc]/route.ts`**

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createContext } from '@/server/trpc/init'
import { appRouter } from '@/server/trpc/root'

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  })
}

export { handler as GET, handler as POST }
```

- [ ] **Step 5: Replace `apps/web/src/app/page.tsx` with the server section**

```tsx
import { serverApi } from '@/server/trpc/root'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const api = await serverApi()
  const health = await api.health.check()

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Tripi</h1>
        <p className="text-sm text-neutral-500">Phase 0 foundation</p>
      </header>

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 font-semibold">Server: tRPC to Postgres</h2>
        <p data-testid="db-status">database: {health.database}</p>
        <p data-testid="place-count">places cached: {health.placeCount}</p>
      </section>
    </main>
  )
}
```

`force-dynamic` keeps the page from being statically prerendered at build time, which would try to reach Postgres during `next build`. Task 6 Step 7 is what actually proves that claim.

- [ ] **Step 6: Verify in dev**

```bash
pnpm --filter @tripi/web dev
```

Open http://localhost:3000. Expected: `database: up` and `places cached: 0`.

If it reads `database: down`, the cause is almost always the env link from Task 5 Step 2 or a stopped Docker stack — run `pnpm preflight`.

Also verify the HTTP route directly:

```bash
curl -s 'http://localhost:3000/api/trpc/health.check' | head -c 200
```

Expected: a JSON body containing `"database":"up"`.

- [ ] **Step 7: Verify the build does not touch Postgres**

This is the step that tests the `force-dynamic` claim rather than asserting it.

```bash
pnpm db:down
pnpm --filter @tripi/web build
pnpm db:up
```

Expected: the build **succeeds** with Postgres stopped, and the route summary marks `/` as dynamic (`ƒ`) rather than static (`○`). If the build fails trying to connect, `force-dynamic` is not doing its job and the page must be reworked before Stage 2.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): tRPC router with health check reading postgres"
```

---

## Task 7: Browser-to-tRPC client probe

Proves the HTTP path from a real browser, which the server component in Task 6 does not exercise. TanStack Query integration is deliberately deferred to Phase 1 — nothing here needs caching yet.

**Files:**
- Create: `apps/web/src/lib/trpc-client.ts`, `apps/web/src/components/HealthProbe.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write `apps/web/src/lib/trpc-client.ts`**

```ts
import type { AppRouter } from '@/server/trpc/root'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      transformer: superjson,
    }),
  ],
})
```

`import type { AppRouter }` is erased at compile time, so importing the router's **type** from a client module creates no runtime edge to the server tree.

- [ ] **Step 2: Write `apps/web/src/components/HealthProbe.tsx`**

```tsx
'use client'

import { trpc } from '@/lib/trpc-client'
import { useEffect, useState } from 'react'

export function HealthProbe() {
  const [status, setStatus] = useState<string>('checking…')

  useEffect(() => {
    trpc.health.check
      .query()
      .then((result) => {
        // Date survives the wire only if superjson is wired on both ends.
        const roundTripped = result.checkedAt instanceof Date
        setStatus(`${result.database} · superjson: ${roundTripped ? 'ok' : 'BROKEN'}`)
      })
      .catch((error: unknown) => {
        setStatus(`error: ${error instanceof Error ? error.message : String(error)}`)
      })
  }, [])

  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-2 font-semibold">Browser: tRPC over HTTP</h2>
      <p data-testid="probe-status">{status}</p>
    </section>
  )
}
```

- [ ] **Step 3: Add the section to `apps/web/src/app/page.tsx`**

Add the import and render the component after the server section:

```tsx
import { HealthProbe } from '@/components/HealthProbe'
```

```tsx
      </section>

      <HealthProbe />
    </main>
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter @tripi/web dev
```

Open http://localhost:3000. Expected: the browser section reads `up · superjson: ok`.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): browser tRPC client probe"
```

---

## Task 8: Hocuspocus 4 realtime server

This is where blocking finding §3.3 is fixed. The reviewed draft built this service with `tsc` and started it with `node dist/server.js`. That does not work: `tsc` emits only the service's own files, resolves `@tripi/shared` through `node_modules` and treats it as an external library. At runtime Node resolves `@tripi/shared` to `packages/shared/src/index.ts` and applies type stripping — which **requires explicit file extensions on relative imports**. The barrel's `./env`, `./db/client`, `./yjs/schema` imports are extensionless, so Node throws `ERR_MODULE_NOT_FOUND` on the first line. Reproduced in probe P2.

The fix is to bundle, so the artefact is self-contained. This also becomes the Dockerfile's build step at Stage 2 unchanged.

**Files:**
- Create: `services/realtime/package.json`, `services/realtime/tsconfig.json`, `services/realtime/tsdown.config.ts`, `services/realtime/src/server.ts`

- [ ] **Step 1: Write `services/realtime/package.json`**

```json
{
  "name": "@tripi/realtime",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env.local src/server.ts",
    "build": "tsdown",
    "start": "node --env-file-if-exists=../../.env.local dist/server.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@hocuspocus/server": "4.6.0",
    "@tripi/shared": "workspace:*",
    "pino": "10.3.1",
    "yjs": "13.6.32"
  },
  "devDependencies": {
    "@types/node": "24.13.3",
    "tsdown": "0.22.14",
    "tsx": "4.23.13",
    "typescript": "7.0.2",
    "vitest": "4.1.11"
  }
}
```

Running under `tsx watch` on the host rather than in Docker is the change from `docs/ops.md` §1.1 — edits reload in under a second instead of triggering an image rebuild. `--env-file-if-exists` (not `--env-file`) because `.env.local` does not exist in CI: the former ignores a missing file, the latter exits with an error.

- [ ] **Step 2: Write `services/realtime/tsdown.config.ts`**

`deps.alwaysBundle` must be set **here, in the config file**. The review's patch used a CLI flag (`--no-external`) that does not exist, and the nearest CLI equivalent (`--deps.always-bundle`) is accepted silently and has no effect — the build succeeds, the dependency stays external, and the artefact crashes exactly as before. Verified in probe P3. Do not "simplify" this back into a CLI flag.

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  // @tripi/shared ships TypeScript source. tsdown externalises declared
  // dependencies by default, which would leave Node to type-strip the shared
  // package at runtime and fail on its extensionless relative imports.
  // Bundling it makes dist/ self-contained. Config-only: the CLI flag is a no-op.
  deps: { alwaysBundle: ['@tripi/shared'] },
})
```

- [ ] **Step 3: Write `services/realtime/tsconfig.json`**

No `outDir` or `rootDir` — `tsc` no longer builds this package, it only type-checks it.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tsdown.config.ts"]
}
```

- [ ] **Step 4: Write `services/realtime/src/server.ts`**

The production guard (review §4.8) is one line and the entire reason this stub cannot reach Stage 2 by accident. Delete it in Phase 4 together with the stub itself.

```ts
import { Server } from '@hocuspocus/server'
import { realtimeEnv } from '@tripi/shared/env'
import pino from 'pino'

const log = pino({ name: 'realtime' })
const env = realtimeEnv()

// Phase 0 authentication accepts anything. This guard is what stops that from
// silently becoming the Stage 2 configuration. Remove it in Phase 4 with the stub.
if (env.NODE_ENV === 'production') {
  throw new Error('Phase 0 stub auth must not run in production')
}

/**
 * Phase 0 server. Authentication is intentionally a permissive stub — Phase 4
 * replaces the body of onAuthenticate with JWT verification and sets
 * `connection.readOnly = true` for viewers, which is the correct way to
 * enforce the viewer role. See docs/prd-review-2026-09-05.md §2.1.
 */
const server = new Server({
  port: env.HOCUSPOCUS_PORT,
  name: 'tripi-realtime',

  async onAuthenticate(data) {
    // Hocuspocus 4 exposes web-standard Headers and URLSearchParams.
    // requestHeaders.get(...) replaces the v2 object indexing in docs/.
    log.info({ documentName: data.documentName }, 'connection authenticated')
    return { user: { id: 'phase-0-anonymous' } }
  },

  async onLoadDocument(data) {
    log.info({ documentName: data.documentName }, 'document loaded')
    return data.document
  },

  async onChange(data) {
    log.debug({ documentName: data.documentName }, 'document changed')
  },
})

server.listen().then(() => {
  log.info({ port: env.HOCUSPOCUS_PORT }, 'realtime server listening')
})
```

- [ ] **Step 5: Install and start in dev**

```bash
pnpm install
pnpm --filter @tripi/realtime dev
```

Expected: a log line reading `realtime server listening` with `"port":1234`.

- [ ] **Step 6: Verify the websocket accepts connections**

In a second terminal:

```bash
curl -s -i -N \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:1234/ | head -5
```

Expected: `HTTP/1.1 101 Switching Protocols`. Stop the dev server.

- [ ] **Step 7: Verify the production path — the step the reviewed plan never had**

```bash
pnpm --filter @tripi/realtime build
head -3 services/realtime/dist/server.mjs
pnpm --filter @tripi/realtime start
```

Expected from `head`: bundled source from `../../packages/shared/src/...`, **not** a line reading `import … from "@tripi/shared"`. If you see that import, `deps.alwaysBundle` is not taking effect and `start` will crash with `ERR_MODULE_NOT_FOUND` — re-check Step 2.

Expected from `start`: the same `realtime server listening` line, served from the built file. Stop with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add services/realtime
git commit -m "feat(realtime): hocuspocus 4 server, bundled build, and stub auth guard"
```

---

## Task 9: Shared Yjs document shape and the two-tab counter

The helpers here are permanent — Phase 2 fills `days` and `activities` with real content. Only the counter field is throwaway.

**Files:**
- Create: `packages/shared/src/yjs/schema.ts`, `packages/shared/src/yjs/schema.test.ts`, `apps/web/src/lib/use-trip-doc.ts`, `apps/web/src/components/RealtimeCounter.tsx`
- Modify: `packages/shared/src/index.ts`, `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write the failing test `packages/shared/src/yjs/schema.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { docNameForTrip, getActivities, getDays, getMeta, tripIdFromDocName } from './schema'

describe('trip document shape', () => {
  it('exposes meta, days, and activities on a fresh doc', () => {
    const doc = new Y.Doc()
    expect(getMeta(doc)).toBeInstanceOf(Y.Map)
    expect(getDays(doc)).toBeInstanceOf(Y.Array)
    expect(getActivities(doc)).toBeInstanceOf(Y.Map)
  })

  it('round-trips a document name through a trip id', () => {
    const tripId = '3f8c1e2a-0b4d-4c9e-8a71-2d5f6e7a8b90'
    expect(tripIdFromDocName(docNameForTrip(tripId))).toBe(tripId)
  })

  it('rejects a document name with the wrong prefix', () => {
    expect(() => tripIdFromDocName('note:123')).toThrow(/document name/i)
  })

  it('merges concurrent edits to different fields without loss', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()

    getMeta(a).set('title', 'Tokyo')
    getMeta(b).set('destination', 'Japan')

    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))

    expect(getMeta(a).get('title')).toBe('Tokyo')
    expect(getMeta(a).get('destination')).toBe('Japan')
    expect(getMeta(b).get('title')).toBe('Tokyo')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @tripi/shared test
```

Expected: FAIL, `Failed to resolve import "./schema"`.

- [ ] **Step 3: Write `packages/shared/src/yjs/schema.ts`**

```ts
import type * as Y from 'yjs'

const DOC_PREFIX = 'trip:'

/** One Yjs document per trip. Never one per day — activities move across days. */
export function docNameForTrip(tripId: string): string {
  return `${DOC_PREFIX}${tripId}`
}

export function tripIdFromDocName(documentName: string): string {
  if (!documentName.startsWith(DOC_PREFIX)) {
    throw new Error(`Unrecognised document name: ${documentName}`)
  }
  return documentName.slice(DOC_PREFIX.length)
}

/** Trip-level fields: title, summary, destination, dates, coverImageKey. */
export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta')
}

/**
 * Days in display order. Positional by design — a day's calendar date is
 * derived from trip.startDate plus its index, never stored. See PRD §4.2.
 */
export function getDays(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray('days')
}

/** Activities keyed by id, so a drag can look up neighbours in O(1). */
export function getActivities(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap('activities')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @tripi/shared test
```

Expected: PASS, 15 tests total across both files.

- [ ] **Step 5: Add the Yjs helpers to `packages/shared/src/index.ts`**

These are browser-safe — the module imports only `type * as Y`, which is erased — so they belong in the barrel. Nothing from `./env` or `./db/` joins them.

```ts
// Browser-safe barrel. Server-only modules are reached through their subpaths:
//   @tripi/shared/env       Zod-validated process env
//   @tripi/shared/db        Drizzle client
//   @tripi/shared/db/schema Drizzle tables
// biome.json enforces that restriction; see the boundaries table in the plan.
export type { CoreEnv, RealtimeEnv, WebEnv } from './env'
export {
  docNameForTrip,
  getActivities,
  getDays,
  getMeta,
  tripIdFromDocName,
} from './yjs/schema'
```

- [ ] **Step 6: Write `apps/web/src/lib/use-trip-doc.ts`**

Two changes from the reviewed draft, both from review §4.1 and §3.1:

`synced` is tracked separately from `connected`. The provider reports `connected` when the websocket opens; the document state arrives afterwards and fires `onSynced`. A test that asserts on `connected` is asserting on a proxy for the state it actually needs — against a warm local server that is a real flake, and this test survives into Phase 3.

The `NEXT_PUBLIC_HOCUSPOCUS_URL` fallback is **removed**. A silent default to localhost is how a misconfigured deploy looks healthy while talking to nothing.

```ts
'use client'

import { HocuspocusProvider } from '@hocuspocus/provider'
import { docNameForTrip } from '@tripi/shared'
import { useEffect, useState } from 'react'
import * as Y from 'yjs'

export type TripDocState = {
  doc: Y.Doc
  provider: HocuspocusProvider | null
  /** The websocket is open. Does not mean the document has arrived. */
  connected: boolean
  /** The initial document state has been received. Assert on this, not on connected. */
  synced: boolean
}

/** Opens a Yjs document for a trip and keeps it synced. */
export function useTripDoc(tripId: string): TripDocState {
  const [doc] = useState(() => new Y.Doc())
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [connected, setConnected] = useState(false)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    // Inlined by Next at build time from apps/web/.env.local (a symlink to the
    // repo root file — see Task 5 Step 2). No fallback on purpose: a default of
    // localhost would let a broken deploy look healthy.
    const url = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL
    if (!url) {
      throw new Error(
        'NEXT_PUBLIC_HOCUSPOCUS_URL is not set. Is apps/web/.env.local linked? Run pnpm preflight.',
      )
    }

    const instance = new HocuspocusProvider({
      url,
      name: docNameForTrip(tripId),
      document: doc,
      // Phase 4 replaces this with a short-lived JWT minted by Next.
      token: 'phase-0-stub',
      onStatus: ({ status }) => setConnected(status === 'connected'),
      onSynced: ({ state }) => setSynced(state),
    })

    setProvider(instance)
    return () => {
      instance.destroy()
      setProvider(null)
      setSynced(false)
    }
  }, [doc, tripId])

  return { doc, provider, connected, synced }
}
```

- [ ] **Step 7: Write `apps/web/src/components/RealtimeCounter.tsx`**

`realtime-status` reads `synced` only when both flags are true, which is what the e2e test waits on.

```tsx
'use client'

import { getMeta } from '@tripi/shared'
import { useTripDoc } from '@/lib/use-trip-doc'
import { useEffect, useState } from 'react'

// A fixed id so every browser tab joins the same document during Phase 0.
const PHASE_0_TRIP_ID = '00000000-0000-4000-8000-000000000000'

export function RealtimeCounter() {
  const { doc, connected, synced } = useTripDoc(PHASE_0_TRIP_ID)
  const [count, setCount] = useState(0)

  useEffect(() => {
    const meta = getMeta(doc)
    const sync = () => setCount(Number(meta.get('counter') ?? 0))
    sync()
    meta.observe(sync)
    return () => meta.unobserve(sync)
  }, [doc])

  // NOTE: read-then-write on a Y.Map is last-writer-wins, not a CRDT counter —
  // two simultaneous clicks lose one increment. Fine for a connectivity probe.
  // Do not copy this as the pattern for real collaborative state; Phase 2 uses
  // Y.Array/Y.Map mutations that merge, and Y.Text for prose.
  const increment = () => {
    const meta = getMeta(doc)
    meta.set('counter', Number(meta.get('counter') ?? 0) + 1)
  }

  const status = connected && synced ? 'synced' : connected ? 'connected' : 'connecting…'

  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-2 font-semibold">Realtime: Yjs through Hocuspocus</h2>
      <p data-testid="realtime-status">{status}</p>
      <p className="my-2 text-2xl font-bold" data-testid="counter-value">
        {count}
      </p>
      <button
        type="button"
        onClick={increment}
        data-testid="counter-increment"
        className="rounded-md bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
      >
        Increment
      </button>
    </section>
  )
}
```

- [ ] **Step 8: Add the section to `apps/web/src/app/page.tsx`**

Add the import and render it after `<HealthProbe />`:

```tsx
import { RealtimeCounter } from '@/components/RealtimeCounter'
```

```tsx
      <HealthProbe />
      <RealtimeCounter />
    </main>
```

- [ ] **Step 9: Verify the round trip by hand**

Run both services from the repo root:

```bash
pnpm dev
```

Open http://localhost:3000 in two browser windows side by side. Both should read `synced`. Click Increment in one. Expected: the number rises in **both** windows within a moment.

- [ ] **Step 10: Verify the client bundle carries no database driver**

The boundary lint from Task 1 catches the import; this catches the outcome.

```bash
pnpm --filter @tripi/web build
grep -rl "postgres-js\|node:tls" apps/web/.next/static/chunks/ | head
```

Expected: no output. Any hit means server code reached the browser bundle — stop and find the import path before continuing.

- [ ] **Step 11: Commit**

```bash
git add packages/shared apps/web
git commit -m "feat: yjs document shape shared between web and realtime"
```

---

## Task 10: End-to-end tests

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/tests/e2e/smoke.spec.ts`, `apps/web/tests/e2e/collab.spec.ts`

- [ ] **Step 1: Write `apps/web/playwright.config.ts`**

The `webServer.command` split is review §3.3. Locally you keep the hot-reload loop; **in CI the suite runs against the built artefacts** — `turbo run start` builds first (Task 1 Step 4 wires `start` → `dependsOn: ["build"]`), then serves `next start` and the bundled realtime server. Without this, "green in CI" only ever meant "green under dev servers", and the deploy path stays unexecuted until Stage 2.

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI exercises the production path; local keeps hot reload.
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    cwd: '../..',
    timeout: 180_000,
  },
})
```

`cwd: '../..'` runs the command from the repo root so Turbo starts the realtime server alongside the web app. The collaboration test needs both. The timeout is 180s rather than 120s because in CI the command now includes a `next build`.

- [ ] **Step 2: Install the browser**

```bash
pnpm --filter @tripi/web exec playwright install chromium --with-deps
```

- [ ] **Step 3: Write `apps/web/tests/e2e/smoke.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

test('renders and reaches postgres through tRPC', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Tripi' })).toBeVisible()
  await expect(page.getByTestId('db-status')).toHaveText('database: up')
  await expect(page.getByTestId('place-count')).toContainText('places cached:')
})

test('browser reaches tRPC over HTTP with superjson intact', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('probe-status')).toHaveText('up · superjson: ok', {
    timeout: 15_000,
  })
})
```

- [ ] **Step 4: Write `apps/web/tests/e2e/collab.spec.ts`**

This is the test that does not get deleted. It becomes the Phase 3 collaboration regression test, which is why it waits on `synced` rather than `connected` (review §4.1).

The failure it avoids: `connected` fires when the websocket opens, before the document state arrives. On a fresh CI server the counter is 0 either way and the bug is invisible. Against a warm local server (`reuseExistingServer: true`, in-memory doc still holding the last run's count), Bob reads `0`, Alice increments the real value to 8, and `before + 1` asserts `1` against `8`. Intermittent, local-only, and maddening.

```ts
import { expect, test } from '@playwright/test'

test('a value set in one tab appears in another through hocuspocus', async ({ browser }) => {
  const alice = await browser.newContext()
  const bob = await browser.newContext()

  const alicePage = await alice.newPage()
  const bobPage = await bob.newPage()

  await alicePage.goto('/')
  await bobPage.goto('/')

  // 'synced', not 'connected': the document state arrives after the socket opens.
  await expect(alicePage.getByTestId('realtime-status')).toHaveText('synced', {
    timeout: 20_000,
  })
  await expect(bobPage.getByTestId('realtime-status')).toHaveText('synced', {
    timeout: 20_000,
  })

  const before = Number(await bobPage.getByTestId('counter-value').innerText())

  await alicePage.getByTestId('counter-increment').click()

  await expect(bobPage.getByTestId('counter-value')).toHaveText(String(before + 1), {
    timeout: 15_000,
  })

  await alice.close()
  await bob.close()
})
```

- [ ] **Step 5: Run the suite in dev mode**

Make sure Docker is up and no stray dev server is running, then:

```bash
pnpm --filter @tripi/web e2e
```

Expected: 3 passed.

- [ ] **Step 6: Run the suite the way CI will**

Same specs, production artefacts. This is the first time the whole system runs from a build.

```bash
pnpm db:up
CI=1 pnpm --filter @tripi/web e2e
```

Expected: 3 passed, and the Playwright output shows it starting `pnpm start` rather than `pnpm dev`.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "test(web): smoke and two-tab collaboration e2e tests"
```

---

## Task 11: CI and the pre-commit hook

`scripts/preflight.mjs` and `lefthook.yml` both moved to Task 1 during execution (review §4.7 for the first; lefthook's install-time file regeneration for the second — see Task 1 Step 11). This task is CI only.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Confirm the pre-commit hook is still installed**

It was installed at Task 1 Step 11 and has been guarding every commit since. Verify rather than assume:

```bash
pnpm exec lefthook install
ls .git/hooks/pre-commit
```

Expected: `sync hooks: ✔️(pre-commit)` and the file exists.

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

One workflow, per `docs/ops.md` §2. Four changes from the reviewed draft:

- **`concurrency`** (M11) — without it, three pushes to a PR branch run three full suites including Playwright.
- **No `version:` on `pnpm/action-setup`** (M3) — with `packageManager` in the root `package.json`, supplying both can fail with "multiple versions of pnpm specified". The action reads `packageManager`.
- **An explicit `pnpm build` step** (review §3.3) — so a build failure reports as a build failure, rather than as a Playwright `webServer` timeout 20 minutes later.
- **`CI: true` on the e2e step** — which is what makes Playwright serve the built artefacts.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:17.11
        env:
          POSTGRES_USER: tripi
          POSTGRES_PASSWORD: tripi
          POSTGRES_DB: tripi
        ports: ['5433:5432']
        options: >-
          --health-cmd "pg_isready -U tripi -d tripi"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DATABASE_URL: postgresql://tripi:tripi@localhost:5433/tripi
      HOCUSPOCUS_PORT: '1234'
      HOCUSPOCUS_JWT_SECRET: ci-secret-that-is-at-least-thirty-two-chars
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      NEXT_PUBLIC_HOCUSPOCUS_URL: ws://localhost:1234

    steps:
      - uses: actions/checkout@v4

      # No `version:` — the action reads packageManager from package.json.
      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Apply migrations
        run: pnpm db:migrate

      - name: Lint and format check
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm test

      # Production parity: the artefacts the e2e step serves are built here, so a
      # build break reports as a build break rather than as a webServer timeout.
      - name: Build
        run: pnpm build

      - name: Install Playwright browser
        run: pnpm --filter @tripi/web exec playwright install chromium --with-deps

      - name: End-to-end tests against the build
        run: pnpm e2e
        env:
          CI: 'true'

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/web/playwright-report/
          retention-days: 7
```

`.env.local` does not exist in CI, which is why the realtime service uses Node's `--env-file-if-exists` rather than `--env-file`. In CI the job's `env` block supplies the same variables to every process.

- [ ] **Step 3: Run the full gate locally the way CI will**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && CI=1 pnpm e2e
```

Expected: all five succeed.

- [ ] **Step 4: Commit and push**

```bash
git add .github
git commit -m "ci: single workflow running lint, types, tests, build, and e2e on the build"
git push -u origin phase-0-foundation
```

- [ ] **Step 5: Confirm CI is green**

```bash
gh run watch
```

Expected: the `ci` job concludes successfully.

---

## Task 12: Record what changed

The plan deviates from `docs/` in several places, and narrows one PRD goal. Write those down so the next session does not "fix" them back.

**Files:**
- Modify: `CLAUDE.md`, `PRD.md`, `README.md`

- [ ] **Step 1: Add a stack section to `CLAUDE.md`**

Append under "Working agreements":

```markdown
## Pinned stack (Phase 0, 2026-09-05)
Node 24 · pnpm 11.25.0 · Turbo 2.10.12 · TypeScript 7.0.2 · Next 16.3.4 · React 19.2.8 ·
Tailwind 4.3.3 · tRPC 11.18.0 · Drizzle 0.45.2 · Postgres 17.11 · Zod 4.5.4 · Yjs 13.6.32 ·
Hocuspocus 4.6.0 · Biome 2.5.12 · Vitest 4.1.11 · Playwright 1.62.1 · Lefthook 2.1.12 ·
tsdown 0.22.14 · @types/node 24.13.3

Exact versions, no carets. Selection policy: newest release that is ≥2 weeks old with ≥1
patch on its major, else the previous stable. Type packages track the runtime major.
Container images pinned to a tag. `docs/` still says Next 15 / Zod 3 / Hocuspocus 2 — stale, ignore.

## Monorepo shape
Three units, not the eight in docs/architecture.md §2:
- `apps/web` — Next app, all UI + tRPC + server modules
- `services/realtime` — Hocuspocus server, host under `tsx watch` in dev, bundled by tsdown for prod
- `packages/shared` — Drizzle schema, Yjs doc shape, Zod env contract. Imports nothing from the other two.

Docker runs postgres + minio + mailpit only.

## Server/client boundary
`@tripi/shared` (the barrel) is browser-safe. `@tripi/shared/env`, `@tripi/shared/db`, and
`@tripi/shared/db/schema` are server-only and restricted by Biome `noRestrictedImports` to
`apps/web/src/server/**`, `apps/web/src/app/api/**`, and `services/realtime/**`.
Never re-export db or env from the barrel — that is what puts the Postgres driver in the
browser bundle. Do not add the `server-only` package to `packages/shared`; it breaks the
realtime service, which is not a React Server environment.

## Phase 0 conventions
- Lint and format is Biome (`pnpm lint`, `pnpm format`). No ESLint, no Prettier.
- `pnpm preflight` checks node version, both `.env.local` files, docker, and ports before you
  debug anything else. Machine state lives there, never in a plan.
- `.env.local` lives at the repo root; `apps/web/.env.local` is a symlink to it, because Next
  only reads env files from the directory it was started in.
- `services/realtime` is bundled with tsdown and `deps.alwaysBundle: ['@tripi/shared']` set in
  `tsdown.config.ts`. The equivalent CLI flag is silently a no-op — do not "simplify" it.
- Drizzle table extras use the array callback form; the object form in docs/data-model.md is the old API.
- Next 16: `params` is a Promise, and middleware would live in `proxy.ts`, not `middleware.ts`.
- Every phase runs `build` and `start`, not just `dev`. CI e2e runs against the build.
```

- [ ] **Step 2: Add the decision-log row to `PRD.md` §10**

Do this **before** touching the phase table (review §4.6). PRD §7 lists "hello world deployed to AWS" in Phase 0; §7b puts cloud entry at Stage 2, after Phase 2. Dropping the deploy is right, but editing the goal cell without a decision-log row hides the change — which is exactly rubric row 1's failure mode.

Add to the §10 table:

```
| 2026-09-05 | Phase 0 no longer includes an AWS deploy; cloud entry is Stage 2 per §7b | Avoids building deploy plumbing before there is anything to deploy. Phase 0 instead proves the production path locally: `pnpm build` and every service's `start` script run in CI from this phase onward. |
```

- [ ] **Step 3: Update the Phase 0 goal in `PRD.md` §7**

Now that the row exists to cite, change the Phase 0 goal cell to:

```
Monorepo, Docker, CI, vertical slice green from a production build (browser → tRPC → Postgres, and two-tab Yjs sync) — AWS deploy moved to Stage 2, see §10 (2026-09-05) — **done 2026-09-05**
```

- [ ] **Step 4: Replace `README.md`**

```markdown
# Tripi

The trip-planning document that replaces the spreadsheet. Collaborative, AI-aware,
and alive during the trip itself.

- Product source of truth: `PRD.md`
- Technical specs: `docs/`
- Review findings and the docs backlog: `docs/prd-review-2026-09-05.md`

## Getting started

Requires Node 24, pnpm 11, and Docker Desktop running.

```bash
nvm use
corepack enable
pnpm install

cp .env.example .env.local
sed -i '' "s|^HOCUSPOCUS_JWT_SECRET=.*|HOCUSPOCUS_JWT_SECRET=$(openssl rand -hex 32)|" .env.local
# Next only reads env files from the directory it starts in:
ln -s ../../.env.local apps/web/.env.local

pnpm db:up
pnpm db:migrate
pnpm dev
```

Then open http://localhost:3000.

On Linux, `sed -i` takes no `''` argument.

`pnpm preflight` diagnoses a broken local setup and is the first thing to run when
something misbehaves. `pnpm build && pnpm start` runs the production path.
Mailpit's inbox is at http://localhost:8025 and MinIO's console at
http://localhost:9001.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md PRD.md README.md
git commit -m "docs: record phase 0 stack, boundary rules, and the Stage 2 deploy decision"
```

---

## Definition of done

Phase 0 is complete when every line below has been run and produced the stated result. Dev-mode green is not green (review §4.2).

**Local — dev path**

- [ ] `pnpm preflight` exits 0 with every check `ok`.
- [ ] `pnpm dev` brings up both services; http://localhost:3000 shows `database: up` from a server component.
- [ ] The same page shows `up · superjson: ok` from the browser.
- [ ] Two browser windows both show `synced`, and incrementing in one moves the number in the other.

**Local — production path**

- [ ] `pnpm build` succeeds from a clean `.turbo` (`rm -rf .turbo && pnpm build`).
- [ ] `pnpm --filter @tripi/realtime start` logs `realtime server listening` **from `dist/server.mjs`**, and `head -3 services/realtime/dist/server.mjs` shows bundled shared source rather than an `import … from "@tripi/shared"` line.
- [ ] `pnpm start` serves the same working page from the built artefacts.
- [ ] `grep -rl "postgres-js\|node:tls" apps/web/.next/static/chunks/` returns nothing.
- [ ] `pnpm --filter @tripi/web build` succeeds with Postgres stopped (`force-dynamic` verified, Task 6 Step 7).

**Gates**

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && CI=1 pnpm e2e` all pass locally.
- [ ] A `'use client'` file importing `@tripi/shared/db` fails `pnpm lint` (Task 4 Step 5).
- [ ] CI is green on the `phase-0-foundation` branch, including the Build step and e2e against the build.

**Records**

- [ ] `CLAUDE.md` records the pinned versions, the three-unit shape, and the server/client boundary rule.
- [ ] `PRD.md` §10 carries the Stage 2 deploy decision, and §7's Phase 0 goal cites it.

> The reviewed draft's "cold start under 60 seconds (PRD §6)" line is deleted. Nothing measured it, so it was decoration. The honest version is a README promise, checked when you care: `time (pnpm install && pnpm db:up && pnpm db:migrate)` on a clean clone.

---

## Known deviations from `docs/` and `PRD.md`

Carry these into the docs backlog in `docs/prd-review-2026-09-05.md` §3 rather than reverting them. PRD deviations live in `PRD.md` §10.

| Deviation | Docs say | Why |
|---|---|---|
| Three workspace units | Eight (`architecture.md` §2) | Review §6.1; six config files before the first feature is not worth it solo |
| Hocuspocus on the host in dev, bundled for prod | In Docker Compose (`ops.md` §1.1) | Review §6.2; rebuild per edit versus sub-second reload. Stage 2 Dockerfile uses the same tsdown build |
| Mailpit in Compose | Not mentioned | Phase 1 needs a local inbox; adding it now costs one Compose block |
| Biome | Pre-commit runs `pnpm lint` with an unnamed linter (`ops.md` §9) | Chosen 2026-09-05 |
| Pre-commit typechecks changed packages only | Full typecheck implied | `ops.md` §9 already asks for changed-packages-only; a slow hook gets bypassed. M4 |
| `place` first, not `trip` | No stated order | `place` is the only table with no FK to Better Auth's `user` |
| `lat`/`lng` as `doublePrecision` | `decimal(9,6)` (`data-model.md` §2.3) | Drizzle returns `decimal` as strings; every map pin would need `Number()`. Coordinates are a measurement, not money. M5 |
| `generate` + `migrate` from the first table | Review §6.9 suggested `drizzle-kit push` locally until Phase 1 | Committed migration files from day one; the first push-vs-migrate divergence is worse than the small upfront cost. M7 |
| **Sentry deferred to Stage 2** | Review §6.9 asked for Sentry from Phase 0 | Nothing is deployed in Phase 0, so there is no environment to report from. PRD §7b already turns Sentry on at Stage 2 entry. M7 |
| Next 16, Zod 4, Hocuspocus 4 | Next 15, Zod 3, Hocuspocus 2 | Those are a major behind as of 2026-09-05 |
| Vitest 4, not 5 | Not mentioned | Vitest 5 was two days old with no patch; version policy selects the previous stable |
| Postgres 17.11 | Postgres 16 | Current stable, and matches what RDS offers |
| **Postgres on host port 5433** | 5432 implied everywhere | A Homebrew `postgresql@17` (database `album_app`) owns 5432 on the dev machine and auto-starts at login. Remapping leaves that project working and cannot re-collide; stopping it would break an unrelated app and recur on every reboot. Container-internal port is unchanged; CI uses 5433 too so `DATABASE_URL` is identical in both. Decided 2026-09-05 |
| Healthchecks on all three services | Only Postgres had one | `docker compose up -d --wait` counts a service without a healthcheck as healthy immediately, so `--wait` would return before MinIO and Mailpit were usable |
| `allowBuilds: lefthook: true` in `pnpm-workspace.yaml` | Not mentioned | pnpm 11 blocks dependency install scripts by default; without it lefthook's binary never downloads and the pre-commit hook cannot install |
| Script is `pnpm preflight`, not `pnpm doctor` | Review §4.7 and rubric say "`pnpm doctor`" | pnpm 11 ships a built-in `pnpm doctor` that shadows a same-named script. The built-in ran and reported "All checks passed" with no `.env.local` present — a silent false green. Found during execution 2026-09-05 |
| `lefthook.yml` written at Task 1, not Task 11 | Review put hooks at Task 11 | lefthook's postinstall regenerates an example file whenever one is missing, so it reappears after every `pnpm install`. Installing at Task 1 also satisfies rubric row 10 for this phase's commits rather than only the last one |
| **MinIO pinned to a frozen image** | Not mentioned | `minio/minio` last published 2025-09-07; community edition is in maintenance. Works as an S3 mock. Revisit at Phase 1 when uploads land: RustFS, Garage, LocalStack S3. §4.5 |
| No `pino` in `apps/web` | Not mentioned | Nothing imported it. When Phase 1 does, add `serverExternalPackages: ['pino']` at the same time. M6 |
| No `preview` environment | "Branched RDS" per PR (`architecture.md` §4) | RDS has no branching; that is a Neon feature. Deferred to Stage 3 |
| No AWS deploy in Phase 0 | `PRD.md` §7 Phase 0 goal | Cloud entry is Stage 2 per §7b. Recorded as a decision-log row, not a silent goal edit. §4.6 |

---

## Verification probes

Rerunnable evidence for claims added or corrected in this revision. All run 2026-09-05 on Node 24.20.0 from `~/.nvm`. The review's own probes remain in `docs/plan-review-phase-0-2026-09-05.md` §6.

### P1 — Next reads `.env.local` from the app directory (basis for §3.1)

```bash
npm pack next@16.3.4 && tar -xzf next-16.3.4.tgz
grep -rn "loadEnvConfig" package/dist/esm/server/next-server.js package/dist/esm/server/config.js
```
`next-server.js:512` → `loadEnvConfig(this.dir, dev, Log, …)`; `config.js:1330` → `loadEnvConfig(dir, …)`. `dir` is the directory `next` was invoked in, never the workspace root.

### P2 — Node type stripping rejects extensionless imports (basis for §3.3)

Reproduced against a scratch monorepo shaped like this one — `packages/shared` exporting `./src/index.ts`, which re-exports `./db/client` extensionless:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/packages/shared/src/db/client'
    imported from …/packages/shared/src/index.ts
```

### P3 — tsdown externalisation (correction 1)

Same scratch monorepo, `tsdown@0.22.14`, run from `services/realtime`:

| Invocation | Result |
|---|---|
| `tsdown src/server.ts --format esm --platform node` | bundle emits `import … from "@tripi/shared"`; `node dist/server.mjs` → `ERR_MODULE_NOT_FOUND` |
| `… --deps.always-bundle '@tripi/shared'` | **identical** — flag accepted, no error, no effect |
| `tsdown.config.ts` with `deps: { alwaysBundle: ['@tripi/shared'] }` | shared source inlined into `dist/server.mjs`; runs correctly |

Also: `--no-external` (the review's flag) is not in `tsdown --help` at all. And `noExternal` in the config is deprecated in 0.22 in favour of `deps.alwaysBundle` — the deprecation warning is emitted at build time.

### P4 — Biome boundary rule fires where it should (basis for §3.2 patch)

`@biomejs/biome@2.5.12` with the `biome.json` from Task 1 Step 6:

```
apps/web/src/components/Bad.ts:1:20 lint/style/noRestrictedImports
  × Server-only: import from a server directory.
  > 1 │ import { db } from '@tripi/shared/db'
```

`apps/web/src/server/Ok.ts` with the identical import produced no diagnostic — the `overrides` block works as prescribed.

### P5 — Registry and image freshness

```bash
npm view vitest time.5.0.0 time.4.1.11      # 2026-09-03 / 2026-08-18
npm view @types/node versions               # 24.13.3 is the newest 24.x
npm view tsdown time                        # 0.23.0 → 2026-09-03; 0.22.14 → 2026-07-23
npm view @playwright/test time.1.63.0       # 2026-09-04
curl -s "https://hub.docker.com/v2/repositories/minio/minio/tags?page_size=3&ordering=last_updated"
```
Newest MinIO tag `RELEASE.2025-09-07T16-13-09Z`, last updated 2025-09-07 — a year stale, as review §4.5 said. `postgres:17.11-alpine` and `axllent/mailpit:v1.31` (2026-08-22) both current.

### P6 — `next typegen` exists (basis for M1)

```bash
ls package/dist/cli/ | grep typegen     # next-typegen.js
```

### P7 — Next 16.3.4 knows about TypeScript 7 (basis for keeping the TS 7 pin)

```bash
grep -n "TypeScript 7" package/dist/lib/typescript/runTypeScriptCli.js
```
Two hits describing how Next invokes TS 7's native compiler through its Node wrapper.
