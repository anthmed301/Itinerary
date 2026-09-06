# Tripi — Learnings

> Lessons that transfer, captured while they were still fresh. Distinct from `docs/build-log.md`, which records *what shipped*; this records *what we now know*.
>
> **Inclusion test:** would this have saved time if we had known it a day earlier, and does it still apply next phase? If no to either, it belongs in the phase plan's deviations table, not here.
>
> Each entry: what we believed → what was true → how we found out → what to do about it.

---

## Method

### L1 — A plan is a hypothesis; only running it makes it true

**Believed:** a carefully written plan, reviewed against a 13-point rubric, is ready to execute.

**True:** the review caught 3 blocking bugs before any code was written — and execution then found 8 more the review missed, including 2 where the review's own prescribed fix was itself wrong.

**Found out:** by running every step rather than reading it.

**Do:** keep the review gate — it has the best cost-to-benefit of anything in the process, because it catches problems while they are still text. But never treat "reviewed" as "correct". Budget for execution-time discovery.

### L2 — "Probe, don't assert" applies to reviews too

**Believed:** a reviewer who verifies claims produces verified fixes.

**True:** the Phase 0 review verified the *problems* rigorously and then wrote *fixes* from memory. Its tsdown command used a flag that does not exist; its version pin violated the version policy the same document had just written.

**Do:** a fix is a claim. It needs a probe like any other. When a review says "do X", run X before believing it.

### L3 — Dev-mode green is the most expensive kind of green

**Believed:** if it works locally and the tests pass, CI is a formality.

**True:** two bugs were *only* visible outside the development server. The worst: Turbo silently filters environment variables unless declared, so the realtime server started fine locally (a config file loaded settings inside the process, after the filter) and refused to start in CI.

**Do:** run `build` and `start` from the first phase, and make CI test the production artefacts. This is why the rubric has a "production parity" row.

### L4 — Check the artefact, not the exit code

**Believed:** a build that succeeds and a server that starts means the build is correct.

**True:** the realtime bundle was mis-configured for hours while both succeeding and running. It worked only because the one module it imported happened to have no relative imports. It would have broken in Phase 3, far from the change that caused it.

**Do:** for anything where "correct" means *what ended up in the file*, assert on the file. Two greps now run in CI for exactly this.

---

## Tooling gotchas

### L5 — A tool's built-in command silently shadows your script

`pnpm doctor` is a built-in pnpm 11 command. Our `"doctor"` script never ran; `pnpm doctor` printed pnpm's own diagnostics and reported **"All checks passed"** while `.env.local` did not exist — a false green that would have persisted for the whole project.

**Do:** after adding a script, run it and confirm the output is *yours*. Ours is now `pnpm preflight`.

### L6 — Config that is only a string may not match what you meant

tsdown's `deps.alwaysBundle: ['@tripi/shared']` matched the bare package name but not `@tripi/shared/env`. Every real import in the codebase is a subpath, so nothing was bundled. A RegExp fixed it.

**Do:** when a config takes patterns, check whether it means exact match or prefix, and verify against a real case.

### L7 — Frameworks now write files into your repo

Next 16 generates `AGENTS.md` and `CLAUDE.md` into the app directory on first run, announced in one easily-missed line. A generated instructions file would have quietly competed with the curated one. Disabled with `agentRules: false`.

**Do:** read first-run output, and check `git status` after a tool's first run.

### L8 — Never lint generated output

Biome reformatted drizzle-kit's generated migration metadata; the next `db:generate` reverted it. That loop would have failed CI forever on files no human edits.

**Do:** exclude generated directories from formatters and linters.

### L9 — Package managers now enforce policy you have to answer

pnpm 11 blocks dependency install scripts until approved (`allowBuilds`), and ships a `minimumReleaseAge` gate that rejected a one-day-old Playwright and offered to write itself an exception. Taking the exception would have defeated the gate; we took the older version instead.

**Do:** when a tool offers to record an exception to its own safety rule, ask whether the rule was right.

### L10 — A strict dependency layout is a design check

`import { sql } from 'drizzle-orm'` in a tRPC router failed to resolve, because the ORM belongs to `packages/shared`, not `apps/web`. The fix was not to add the dependency — it was to move the query into `packages/shared`, where the stated boundary says SQL lives.

**Do:** treat "module not found" in a monorepo as a possible architecture signal, not just a missing install.

---

## Process

### L11 — Boundaries in prose rot; boundaries in tooling hold

The rule "database code must not reach the browser" was written down in the first draft and violated by that same draft's own example code. As a lint rule with an allow-list, it fails the build instead.

**Do:** if a rule matters enough to write down, add the check that enforces it — then test that the check fires.

### L12 — Record the decision before editing the record

The draft plan marked Phase 0 done by rewriting the PRD's goal cell. That hides a change. The rule now: write the decision-log row first, then edit the goal cell so it cites the row.

**Do:** deviations have exactly one home, and a changed goal always points at its reason.

### L13 — Machine state belongs in a script, not a plan

The plan hard-coded "your Node is 23.6.0" and was stale within hours — and also wrong about what was installed versus active.

**Do:** plans describe the target; `pnpm preflight` describes the machine.

### L14 — A gate nobody runs is not a gate

The workflow only triggers on push-to-main and pull requests, so pushing a feature branch ran nothing — while `gh workflow list` also came back empty, making it look unregistered. The plan's final step would have waited forever.

**Do:** confirm the gate actually ran. "I pushed it" is not "CI passed".

---

## Security

### L15 — Map to the *current* OWASP list, not the one you remember

The Top 10 people quote from memory is the 2021 list. The **2025** list (final Jan 2026) reorders materially: Injection dropped from A03 to **A05**, **Software Supply Chain Failures is new at A03**, SSRF was retired into Broken Access Control, and **A10 Mishandling of Exceptional Conditions** is new. A control matrix built from memory would have had the wrong shape and missed A10 entirely.

**Do:** fetch the list before mapping to it. Note also that our Phase 0 habits — pinned versions, committed lockfile, `--frozen-lockfile`, install-script allow-lists — turn out to be A03 controls; we got that one early by accident of discipline.

### L16 — A library's documented behaviour is not its actual behaviour

`docs/security.md` stated Better Auth uses **bcrypt** and advised bumping the cost factor to 12. It uses **scrypt** via `node:crypto`. We would have spent time tuning a parameter that does not exist.

**Do:** before writing a security control into a spec, read the library's shipped code. One `grep` in `dist/` settled it.

### L17 — Check a security default's *value*, not just its presence

Better Auth's rate limiting is `enabled ?? isProduction` — **off in development**. Configuring `rateLimit: { window, max }` and moving on would have left brute-force protection switched off in every environment where we could actually test it. We would have shipped a control we had never once observed working.

**Do:** for any security setting, find the default and ask "in which environments is this actually on?" Then make sure at least one environment you can test has it on.

### L18 — Name what you are *not* covering

A control matrix with ten green rows invites the belief that ten categories are handled. Phase 1 has no TLS, nothing watching its logs, no SAST, no pen test, and no trip-level authorization yet.

**Do:** every security summary carries an explicit "what this does not cover" section. Precision about limits is what makes the covered claims trustworthy.

