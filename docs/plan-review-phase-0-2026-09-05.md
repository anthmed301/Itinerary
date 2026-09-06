# Phase 0 Plan Review — 2026-09-05

> Review of `docs/superpowers/plans/2026-09-05-phase-0-foundation.md` against `docs/plan-review-rubric.md`. Findings are ranked by how much they would cost if discovered during the build. Every claim marked **verified** was checked by running a command or reading the published package on 2026-09-05; the probes are in §6 so they can be rerun.

---

## 1. Verdict

The plan is strong where it is specific: every one of the 22 pinned versions is exactly what the registry serves today, the Hocuspocus 4.6 API it uses (`new Server`, `listen()`, `requestHeaders: Headers`, `connection.readOnly`, provider `token`/`onStatus`/`onSynced`) matches the shipped type definitions, and the Node flag it leans on (`--env-file-if-exists`) exists on Node 24 and is forwarded correctly by `tsx`. The task order, per-task commits, TDD only where there is logic, and the deviations table are all what a good plan looks like.

It has **three blocking defects**, all of the same species: a claim about how a tool behaves that was never probed. Two of them fail during Phase 0 itself (Task 6 and Task 9), the third fails silently and would surface at Stage 2 when the realtime service is first started from a build.

1. **Next never reads the root `.env.local`** (§3.1). Task 6 Step 6 throws `Invalid environment` instead of rendering `database: up`.
2. **Client components import the DB driver through the shared barrel** (§3.2). The browser bundle fails to build in Task 9.
3. **The realtime service's production path does not run** (§3.3). `pnpm build` passes and `pnpm start` crashes, and nothing in the plan or CI ever executes either.

Fix those three, apply the high-priority items in §4, and the plan is executable. The rubric scores are in §2 and the process changes this review adds are in §7.

## 2. Rubric scores

| # | Dimension | Score | Evidence |
|---|---|---|---|
| 1 | Goal fidelity | 2 | PRD §7 says Phase 0 includes "hello world deployed to AWS". The plan drops it (correctly, per §7b) but Task 12 rewrites the PRD goal cell instead of logging a decision. §4.6 |
| 2 | Claim verification | 3 | Versions and Drizzle API verified by the author. Env loading, browser bundling, and Node type-stripping were asserted, not probed, and all three are wrong. §3 |
| 3 | Executability | 2 | Task 0 hard-codes machine state that is already stale: Node 24.20.0 is installed under nvm and Docker is running. Three steps fail as written (§3.1–3.3). |
| 4 | Production parity | 1 | No step and no CI job runs `pnpm build` or any `start` script. The realtime `start` script cannot work. §3.3 |
| 5 | Boundary enforcement | 2 | Boundaries are prose. The one that matters most (server code out of client bundles) is violated by the plan's own code. §3.2 |
| 6 | Test determinism | 3 | Unit tests are clean. The collab e2e asserts after `connected` but the data it reads arrives on `synced`; flaky against a warm local server. §4.1 |
| 7 | Config contract | 2 | One `.env.local`, but Next does not load it, `drizzle.config.ts` silently defaults to a hard-coded URL, and the setup step writes the JWT secret twice. §3.1, §4.4 |
| 8 | Dependency risk | 3 | Pins are exact and correct. Four are under 48 hours old, three are `.0.0` majors, `@types/node` is two majors ahead of the runtime, and the MinIO image has been frozen for a year. §4.3, §4.5 |
| 9 | Consistency with docs | 4 | Good deviations table. Missing rows: Sentry-from-Phase-0 dropped, `generate`+`migrate` from Phase 0 instead of `push`, `pino` added to web unused. §5 |
| 10 | Process hygiene | 4 | One commit per task, hooks before push. Commits the retired `PLAN.md`. §4.7 |
| 11 | Security posture | 3 | Stub auth is labelled and has a removal phase. Nothing stops it from starting with `NODE_ENV=production`. §4.8 |
| 12 | Scope discipline | 4 | Tight. `pino` in `apps/web` is unused; the `database: 'down'` branch cannot execute. §5 |
| 13 | Definition of done | 3 | Good commands, but no `build`, no `start`, and "under 60 seconds" is unmeasured. §4.2 |

## 3. Blocking findings

### 3.1 Next.js does not load `.env.local` from the repo root

**Verified.** Next calls `loadEnvConfig(dir)` where `dir` is the app directory it was started in (`next@16.3.4`, `dist/build/index.js:487`, same in `next dev`). With `next dev` running from `apps/web`, the root `.env.local` is invisible. `DATABASE_URL` is undefined, `env()` throws `Invalid environment: DATABASE_URL: ...`, and the server component in Task 6 Step 6 renders an error page instead of `database: up`. The browser probe in Task 7 fails the same way. `NEXT_PUBLIC_HOCUSPOCUS_URL` is also never inlined, so Task 9 silently falls back to its hard-coded default.

CI is unaffected because the job `env:` block sets everything in the process environment, which is exactly why this would only be noticed locally.

**Patch.** Keep the single root file as the source of truth and give Next a symlink to it. In Task 2 Step 3:

```bash
cp .env.example .env.local
ln -s ../../.env.local apps/web/.env.local
```

Add `apps/web/.env.local` to `.gitignore` (the existing `.env.local` pattern already matches it in any directory, so no change is needed there, but say so in the plan). Add a doctor check: `apps/web/.env.local` exists and resolves. Put the same two lines in the README's getting-started block. Alternative if symlinks offend: `"dev": "dotenv -e ../../.env.local -- next dev --port 3000"` with `dotenv-cli`; the symlink is fewer moving parts.

### 3.2 Client components pull the Postgres driver into the browser bundle

`RealtimeCounter.tsx` and `use-trip-doc.ts` are `'use client'` modules that import `getMeta` and `docNameForTrip` from `@tether/shared`. That barrel (`packages/shared/src/index.ts`, Task 4 Step 4 onward) re-exports `db` and `createDb` from `db/client.ts`, which imports `postgres` and `drizzle-orm/postgres-js`. Bundling a client component therefore bundles the Node Postgres driver: Turbopack fails on `net`/`tls`/`crypto` resolution, and if it did not, the browser bundle would carry a database client. Task 9 Step 8 fails.

The plan already defines the subpath exports that fix this (`./db`, `./yjs`) and then never uses them.

**Patch.**

1. The root barrel exports only browser-safe code: the Yjs helpers and types. Remove `createDb`, `db`, `schema`, `place`, `placeIsStale` from `index.ts`. Server code imports `@tether/shared/db` and `@tether/shared/env`; add `"./env": "./src/env.ts"` to the exports map. Rename `"./schema"` to `"./db/schema"` so the word "schema" is not shared between the DB and Yjs subpaths.
2. Enforce it with Biome rather than prose. In `biome.json`, under `linter.rules.style`, add `noRestrictedImports` with `@tether/shared/db` and `@tether/shared/env` restricted, then override it to allow those paths for `apps/web/src/server/**`, `apps/web/src/app/api/**`, and `services/realtime/**` using a `overrides` block. Client code that reaches for the database then fails lint, not the browser.
3. Do not use the `server-only` package inside `packages/shared`: it throws on import outside a React Server environment, which breaks the realtime service.

Update the "Responsibility boundaries" list to say: "Client components import `@tether/shared` (browser-safe) only; `@tether/shared/db` and `@tether/shared/env` are lint-restricted to server directories."

### 3.3 The realtime service's production path is broken and never exercised

**Verified.** `services/realtime` builds with `tsc` and starts with `node dist/server.js`. `tsc` emits only the service's own files; `@tether/shared` is resolved through `node_modules` and treated as an external library, so nothing from it is emitted. At runtime Node resolves `@tether/shared` to `packages/shared/src/index.ts` and applies type stripping, which requires explicit `.ts` extensions on relative imports. The plan's `./env`, `./db/client`, `./yjs/schema` imports are extensionless, so Node throws `ERR_MODULE_NOT_FOUND` on the first line of the barrel. Probe in §6.3 reproduces it with two files.

Nothing runs `pnpm build`, `next build`, `next start`, or the realtime `start` script anywhere in the plan, CI, or the Definition of done. That also leaves three other claims untested: `force-dynamic` preventing a build-time database call, `transpilePackages` working under `next build`, and TypeScript 7 working with Next's build-time type check (it does, see §4.3, but the plan never finds out).

**Patch.**

1. Bundle the realtime service so its artefact is self-contained. Replace `"build": "tsc"` with `tsdown` (`tsdown@0.23.0`, the maintained successor to tsup): `"build": "tsdown src/server.ts --format esm --platform node --no-external @tether/shared"` and `"start": "node --env-file-if-exists=../../.env.local dist/server.mjs"`. Keep `tsc --noEmit` for `typecheck`. Remove `outDir`/`rootDir` from its tsconfig. This also becomes the Dockerfile's build step at Stage 2 unchanged.
2. Add a Task 11 step and a CI step, before e2e: `pnpm build`. Then run e2e against the built output in CI: in `playwright.config.ts`, `command: process.env.CI ? 'pnpm start' : 'pnpm dev'`, with a root `"start": "turbo run start"` script and `turbo.json` `start` task marked `persistent`, `cache: false`, `dependsOn: ["build"]`. Locally `pnpm dev` stays the default so the hot-reload loop is unchanged.
3. Add to the Definition of done: `pnpm build` succeeds, and `pnpm --filter @tether/realtime start` logs `realtime server listening` from the built file.

## 4. High-priority findings

### 4.1 The collaboration test races the initial document sync

`realtime-status` shows `connected` when the websocket opens. The document state arrives afterwards and fires `onSynced`. `collab.spec.ts` reads `before` from Bob's page as soon as it says `connected`. On a fresh CI server the counter is 0 either way. Against a warm local server (`reuseExistingServer: true`, in-memory doc still holds last run's count), Bob can read `0` before sync lands, Alice increments the real value, and the assertion `before + 1` fails intermittently. This is the test the plan says survives into Phase 3, so it should be deterministic from day one.

**Patch.** In `use-trip-doc.ts` add `synced` state driven by `onSynced: ({ state }) => setSynced(state)`, expose it, and render `synced` in `realtime-status` once both `connected` and `synced` are true. The test waits for `synced`. Both provider hooks exist in `@hocuspocus/provider@4.6.0` (`index.d.ts:360,363`).

### 4.2 The Definition of done is dev-only

Covered by §3.3. Add `pnpm build`, the realtime `start` probe, and replace "under 60 seconds" with a measurable line or delete it: `time (pnpm install && pnpm db:up && pnpm db:migrate)` on a clean clone is the only version of that claim that means anything, and it belongs in the README as a promise, not the DoD.

### 4.3 Dependency freshness and mismatches

All pins resolve exactly (verified against the registry). Four are risky for a different reason:

| Package | Pinned | Published | Issue | Recommendation |
|---|---|---|---|---|
| `vitest` | 5.0.0 | 2026-09-03 | First release of a new major, two days old | Pin `4.1.11` for Phase 0; bump when 5.0.x lands |
| `@playwright/test` | 1.63.0 | 2026-09-04 | One day old | Acceptable (Playwright minors are stable), or `1.62.1` |
| `@types/node` | 26.4.1 | 2026-09-01 | Types for Node 26 on a Node 24 runtime: the compiler will accept APIs that do not exist at runtime | Pin `24.13.3`. Types follow the runtime major, always |
| `typescript` | 7.0.2 | 2026-07-08 | Native compiler; `typescript@7` ships no classic JS API (`lib/typescript.js` is gone, only `lib/tsc.js` and `dist/api/*`) | **Keep.** Verified that `next@16.3.4` detects TypeScript 7 and shells out to the CLI (`dist/lib/typescript/runTypeScriptCli.js`). Vitest, tsx, drizzle-kit, and Biome do not use the TS API. The remaining risk is editor tooling: the `"plugins": [{"name":"next"}]` tsconfig entry is a tsserver plugin, and the native language server may not load it; harmless if so |

Also: the plan's version policy sentence ("latest stable pinned exactly") is fine as a pin rule and weak as a selection rule. Rubric row 8 replaces it: newest major only after one patch and two weeks, otherwise previous stable, fallback named.

### 4.4 Configuration leaks

- **Duplicate secret lines.** `.env.example` ships a placeholder `HOCUSPOCUS_JWT_SECRET`; Task 2 Step 3 appends a second line. Which value wins depends on the reader (Node's env-file parser and the hand-written regex in `drizzle.config.ts` may disagree). Generate the file once instead: `sed -i '' "s/^HOCUSPOCUS_JWT_SECRET=.*/HOCUSPOCUS_JWT_SECRET=$(openssl rand -hex 32)/" .env.local`. Same fix in the README.
- **Silent default in `drizzle.config.ts`.** If the regex misses (quoted value, CRLF, renamed file) it falls back to a hard-coded localhost URL and the migration runs against whatever is on 5432. Delete the fallback and throw `DATABASE_URL not set and .env.local not found`. Or drop the hand parser for `dotenv@17.4.2` with `config({ path: '../../.env.local' })`, which handles quoting.
- **One env schema for two services.** The realtime server cannot boot without `NEXT_PUBLIC_APP_URL`, which it never uses, and the web app requires `HOCUSPOCUS_JWT_SECRET` before Phase 4 needs it. Split `EnvSchema` into a shared core plus `webEnv()` and `realtimeEnv()` parsers now, while it is thirty lines, not in Phase 4 when it is three hundred.
- **`db()` singleton does not survive Next dev reloads.** The comment claims it prevents a pool per reload; a module-level variable is re-created whenever Next re-evaluates the module during HMR. Each reload leaks one connection at `max: 1`; Postgres' default limit is 100. Stash on `globalThis` in non-production, which is the standard Next + Drizzle pattern.

### 4.5 Docker images are unpinned, and MinIO is frozen

**Verified on Docker Hub.** `minio/minio` was last published on 2025-09-07 (community edition entered maintenance). It still works as an S3 mock, so it is not blocking, but "pin everything exactly" should apply to images too: `postgres:17.11-alpine`, `axllent/mailpit:v1.31`, `minio/minio:RELEASE.2025-09-07T16-13-09Z`. Add a row to the deviations table: MinIO is a frozen image, revisit at Phase 1 when uploads land (candidates: RustFS, Garage, LocalStack S3). Also `db:up` should be `docker compose up -d --wait` so `db:migrate` can follow immediately, and `db:reset` drops its `sleep 4`.

### 4.6 The PRD's Phase 0 goal is edited rather than decided

PRD §7 Phase 0: "Monorepo, Docker, CI, hello world deployed to AWS". §7b places cloud at Stage 2, after Phase 2, so dropping the deploy from Phase 0 is right. Task 12 Step 2 implements that by rewriting the goal cell and marking the phase done. That hides the change. Add a §10 decision-log row: "2026-09-05 — Phase 0 no longer includes an AWS deploy; cloud entry is Stage 2 per §7b — avoids building deploy plumbing before there is anything to deploy". Then edit the goal cell with the row as its citation.

### 4.7 Task 0 encodes the machine, and commits a retired file

- Node 24.20.0 is already installed under nvm; Docker is already running. Both statements in Task 0 were stale within hours. Replace them with `nvm use` and `pnpm doctor` (move `scripts/doctor.mjs` from Task 11 to Task 1 so it exists when Task 0 needs it).
- Task 0 Step 4 commits `PLAN.md`. `CLAUDE.md` says it is retired and `PRD.md` holds its content. Delete it in that commit.

### 4.8 The stub authenticator has no production guard

`onAuthenticate` accepts any token, which is right for Phase 0. Add one line so it can never reach Stage 2 by accident:

```ts
if (env().NODE_ENV === 'production') throw new Error('Phase 0 stub auth must not run in production')
```

Delete it in Phase 4 with the stub.

## 5. Medium and low findings

| # | Where | Finding | Fix |
|---|---|---|---|
| M1 | `apps/web/tsconfig.json` | `include` omits `tests/**`, `playwright.config.ts`, `next.config.ts`; e2e code is never type-checked | Add them. Use `"typecheck": "next typegen && tsc --noEmit"` (`next typegen` ships in 16.3.4) so `.next/types` exists before `tsc` runs in CI |
| M2 | `routers/health.ts` | `database: 'down'` cannot occur: `count(*)` always returns a row, and an outage throws. The RSC page crashes instead of showing `down` | Either `try/catch` and return `down`, or delete the branch. Do not ship a handler that looks like it handles failure |
| M3 | `.github/workflows/ci.yml` | `pnpm/action-setup@v4` with `version:` while `package.json` has `packageManager` can error with "multiple versions of pnpm specified" | Drop `version:`; the action reads `packageManager` |
| M4 | `lefthook.yml` | Runs the full `pnpm typecheck`; `docs/ops.md` §9 says changed packages only and `pnpm test --changed` | `turbo run typecheck --filter=...[HEAD]`, or record the deviation |
| M5 | `db/schema.ts` | `lat`/`lng` as `decimal` come back from Drizzle as strings; every map pin will `Number()` them. `doublePrecision` is the right column for coordinates | Change now; it is the cheapest moment. Record as a `data-model.md` deviation |
| M6 | `apps/web/package.json` | `pino` is a dependency nothing imports. When it is used, Next needs `serverExternalPackages: ['pino']` | Remove until Phase 1; note the config requirement |
| M7 | deviations table | Review §6.9 asked for Sentry from Phase 0; the plan drops it silently. Review §6.9 also said `drizzle-kit push` locally until Phase 1; the plan uses `generate`+`migrate` from the first table (a better choice) | Add both rows |
| M8 | `RealtimeCounter.tsx` | `meta.set('counter', n + 1)` is last-writer-wins, not a CRDT counter; two simultaneous clicks lose one | Fine for a probe; add a comment so it is not copied as a pattern |
| M9 | `tsconfig.base.json` | `declaration: true` in base, overridden to `false` in two of three packages | Set `false` in base; nothing consumes declarations |
| M10 | `.gitignore` | Missing `apps/web/next-env.d.ts` (generated by Next 16) | Add |
| M11 | `ci.yml` | No `concurrency:` group; pushes to a PR branch queue full runs | `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` |
| M12 | Task 6 ↔ Tasks 7/9 | Task 6 creates empty component stubs to keep the page compiling, then later tasks replace them | Compose `page.tsx` in Task 9 instead; Task 6 renders only the server section. Removes the stub step |

## 6. Verification probes

Rerunnable evidence for the verified claims above. All run on 2026-09-05 with Node 24.20.0 from `~/.nvm`.

### 6.1 Registry versions

```bash
for p in typescript next react zod @hocuspocus/server vitest @playwright/test drizzle-orm @types/node pnpm; do
  printf "%-20s %s\n" "$p" "$(npm view "$p" version)"; done
```
Every pin in the plan's table matched. Publish dates: vitest 5.0.0 → 2026-09-03, @playwright/test 1.63.0 → 2026-09-04, pnpm 11.25.0 → 2026-09-04, @biomejs/biome 2.5.12 → 2026-09-03.

### 6.2 Hocuspocus 4.6.0 API

```bash
npm pack @hocuspocus/server@4.6.0 @hocuspocus/provider@4.6.0 && tar -xzf hocuspocus-server-4.6.0.tgz
grep -n "declare class Server\|listen(\|requestHeaders\|readOnly" package/dist/index.d.ts
```
`Server` constructor takes `Partial<ServerConfiguration>`, `listen()` returns `Promise<Hocuspocus>`, hook payloads carry `requestHeaders: Headers`, and `Connection` has `readOnly: boolean`. Provider config accepts `url`, `name`, `token`, `onStatus`, `onSynced`.

### 6.3 Node type stripping rejects extensionless imports (basis for §3.3)

```bash
printf 'import { x } from "./b"\nconsole.log(x)\n' > a.ts
printf 'export const x: number = 42\n' > b.ts
node a.ts        # ERR_MODULE_NOT_FOUND
sed -i '' 's#./b"#./b.ts"#' a.ts && node a.ts   # 42
```

### 6.4 `tsx` forwards `--env-file-if-exists`

```bash
printf 'FOO=1\n' > t.env
npx -p tsx@4.23.13 tsx --env-file-if-exists=./t.env a.ts       # FOO visible
npx -p tsx@4.23.13 tsx --env-file-if-exists=./missing.env a.ts # "not found. Continuing without it."
```

### 6.5 Next loads env from the app directory (basis for §3.1)

```bash
npm pack next@16.3.4 && tar -xzf next-16.3.4.tgz
grep -n "loadEnvConfig(" package/dist/build/index.js     # loadEnvConfig(dir, ...)
```
`dir` is the directory `next` was invoked in.

### 6.6 Next 16.3.4 supports TypeScript 7 (basis for §4.3)

```bash
grep -n "TypeScript 7\|native" package/dist/lib/typescript/runTypeScriptCli.js | head
npm pack typescript@7.0.2 && tar -tzf typescript-7.0.2.tgz | grep "lib/typescript.js"   # no output
```

### 6.7 Docker Hub freshness (basis for §4.5)

```bash
curl -s "https://hub.docker.com/v2/repositories/minio/minio/tags?page_size=3&ordering=last_updated"
```
Newest tag `RELEASE.2025-09-07T16-13-09Z`, last updated 2025-09-07.

## 7. Process changes adopted from this review

1. **`docs/plan-review-rubric.md` is now the gate.** Every phase plan gets a review file like this one before `superpowers:executing-plans` or `subagent-driven-development` touches it. `CLAUDE.md` points at the rubric.
2. **Probe, do not assert.** Any sentence in a plan of the form "X does Y" about a framework, runtime, or CLI carries either a command with expected output or a citation the author opened. The three blockers here were all un-probed assertions; the claims the author did probe (Drizzle's array form, version numbers) were all right.
3. **Production parity is part of Phase 0.** `pnpm build` and each service's `start` script run locally and in CI from the first phase. The Definition of done for every phase includes them.
4. **Machine state lives in `pnpm doctor`, not in plans.** Plans say "run `pnpm doctor`"; they never say what version of Node is installed.
5. **Boundaries are tooled.** A boundary that is only in prose is a suggestion. Subpath exports plus a Biome restricted-imports rule enforce the server/client split from Task 1.
6. **One home per deviation.** PRD deviations are decision-log rows in `PRD.md` §10. `docs/` deviations are rows in the plan's deviations table and in `docs/prd-review-2026-09-05.md` §3 until the doc is fixed. Goal cells in the PRD are never edited without a decision-log citation.
7. **Version selection policy.** Exact pins stay. "Latest" means the newest release that is at least two weeks old with at least one patch on its major, unless the plan names the fallback and the step that would reveal the failure. Type packages track the runtime major. Container images are pinned to tags.

## 8. What the plan gets right and should keep

- Three workspace units, Hocuspocus on the host, Docker for stateful services only.
- TDD on the two pieces of real logic (env contract, Yjs doc helpers) and nowhere else.
- One commit per task, branch before scaffolding, hooks installed before the first push.
- Exact pins with a stated resolution date; every pin correct.
- Correct Hocuspocus 4 usage, including the `readOnly` plan for Phase 4 and `--env-file-if-exists` for the CI/local split.
- The deviations table, and the instruction to carry deviations into the docs backlog rather than revert them.
- `place` as the first table for the FK reason stated, with the Foursquare 24-hour note in the schema comment.
- The collab e2e test being designed to survive into Phase 3.

## 9. Next step

Apply §3 (three blockers) and §4 (eight items) to the plan, re-score rows 1–8 of the rubric, then execute. The patches are specific enough to apply in one editing pass; nothing in them changes the plan's architecture or task order except merging the Task 6 stubs into Task 9 (M12).

---

## 10. Re-score after revision — 2026-09-05

Revision 2 of `docs/superpowers/plans/2026-09-05-phase-0-foundation.md` applies §3, §4, and §5 in full. Its **Revision log** maps each finding to the task that carries it, and its **Verification probes** section holds the new evidence (P1–P7).

### 10.1 Corrections to this review found while applying it

Two of this review's own patches were wrong, and one of its premises was half wrong. Recorded here because rubric row 2 applies to reviews as well as plans.

1. **§3.3's tsdown command does not work.** `--no-external` is not a tsdown flag. The nearest CLI equivalent, `--deps.always-bundle`, is accepted without error and has **no effect**: the build succeeds, `@tether/shared` stays external, and the artefact fails with the same `ERR_MODULE_NOT_FOUND` the patch was written to fix — a silent no-op, which is worse than an error. Only `tsdown.config.ts` with `deps: { alwaysBundle: [...] }` works. Probe P3.
2. **§3.3's tsdown pin violates §4.3's own policy.** `tsdown@0.23.0` published 2026-09-03: two days old, no patch. The policy this review wrote in §4.3 selects `0.22.14` (2026-07-23). The plan pins `0.22.14`.
3. **§4.7's premise is half wrong.** Node 24.20.0 *is* installed under nvm, but the active `node` is still v23.6.0 from Homebrew and **pnpm is not installed at all**, so Task 0 was not merely restating stale facts — it had real work. The finding's *conclusion* stands and is applied: machine state moved into `pnpm doctor`, which moved from Task 11 to Task 1.

§3.1, §3.2, §4.5 and M1 were each independently confirmed (P1, P2, P4, P5, P6).

### 10.2 Scores

| # | Dimension | Was | Now | Evidence |
|---|---|---|---|---|
| 1 | Goal fidelity | 2 | **5** | Task 12 Step 2 writes the `PRD.md` §10 decision row *before* Step 3 edits the §7 goal cell, and the cell cites it |
| 2 | Claim verification | 3 | **5** | Seven probes (P1–P7) in the plan, all rerunnable. The three previously-asserted claims are now the three best-evidenced ones |
| 3 | Executability | 2 | **5** | Task 0 activates a toolchain and asserts nothing about the machine; `pnpm doctor` (Task 1 Step 8) owns machine state and is verified to *fail correctly* at Task 1 Step 10 |
| 4 | Production parity | 1 | **5** | `build` + `start` at Task 5 Step 10, Task 6 Step 7, Task 8 Step 7, Task 10 Step 6, CI Build step, and six Definition-of-done lines. `turbo` `start` → `dependsOn: ["build"]` makes a stale artefact impossible |
| 5 | Boundary enforcement | 2 | **5** | Biome `noRestrictedImports` + `overrides` (verified, P4), subpath exports, and Task 4 Step 5 which *proves the rule fires* before the migration is generated. Task 4 Step 4 is an explicit non-change with the reason attached |
| 6 | Test determinism | 3 | **5** | `synced` is separate state driven by `onSynced`; the collab spec waits on it, and the plan states the exact flake it prevents |
| 7 | Config contract | 2 | **5** | One root `.env.local`; `apps/web/.env.local` symlinks to it; `drizzle.config.ts` throws instead of defaulting; the `NEXT_PUBLIC_HOCUSPOCUS_URL` fallback is gone; the secret is replaced not appended, with a `grep -c` check |
| 8 | Dependency risk | 3 | **5** | Selection policy stated and applied: vitest 5→4.1.11, `@types/node` 26→24.13.3, tsdown 0.23.0→0.22.14. TS 7 kept with the probe and the fallback both named. Three container images pinned |
| 9 | Consistency with docs | 4 | **5** | Deviations table gained six rows including the two this review said were missing (Sentry, `generate`+`migrate`) plus `doublePrecision`, MinIO, vitest, and the PRD deploy row |
| 10 | Process hygiene | 4 | **5** | `PLAN.md` deleted in Task 0 Step 4 rather than committed; one commit per task; hooks before the first push |
| 11 | Security posture | 3 | **5** | Production guard on the stub in Task 8 Step 4, with its removal phase named in the comment above it |
| 12 | Scope discipline | 4 | **5** | `pino` gone from `apps/web`; the `database: 'down'` branch is now reachable via `try/catch`; the LWW counter is labelled do-not-copy |
| 13 | Definition of done | 3 | **5** | Split into dev / production / gates / records; every line is a command with a stated result. The unmeasured "60 seconds" line is deleted, with the honest version named |

**No row scored 1 or 2. The plan clears the rubric gate and is cleared for execution.**

### 10.3 Accepted risks carried into execution

Not defects — things that could still bite, each with the step that would reveal it.

| Risk | Reveal step | Fallback |
|---|---|---|
| TypeScript 7 is a new major compiler | Task 1 Step 9 (`tsc --version`), and every `typecheck` after | `pnpm add -Dw typescript@6`; nothing else changes |
| Playwright 1.63.0 is one day old | Task 10 Steps 2 and 5 | `1.62.1` (2026-07-30) |
| MinIO image frozen a year | Not exercised in Phase 0 | Revisit at Phase 1: RustFS, Garage, LocalStack S3 |
| `next typegen` in `typecheck` | Task 5 Step 9, CI Typecheck step | Drop to plain `tsc --noEmit` and remove `.next/types` from `include` |
| The `apps/web/.env.local` symlink | `pnpm doctor`, Task 5 Step 2 | `dotenv-cli` on `dev`/`build`/`start`, named in Task 5 Step 2 |
