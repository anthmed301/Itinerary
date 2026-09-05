# Implementation Plan Review Rubric

> Apply this to every phase plan under `docs/superpowers/plans/` **before** executing it. A plan is "reviewed" when every row has a score and a one-line piece of evidence, and every 1–2 is either fixed or accepted in writing. First applied to Phase 0 in `docs/plan-review-phase-0-2026-09-05.md`.

## How to score

| Score | Meaning |
|---|---|
| 5 | Verified: the reviewer ran, read, or fetched proof. |
| 4 | Strong: claims are consistent and specific; a spot check passed. |
| 3 | Plausible: reads correctly but nothing was checked. |
| 2 | Weak: a gap exists that would cost hours to discover mid-build. |
| 1 | Broken: a step fails as written, or the plan delivers a different goal than the PRD states. |

Any row at 1 blocks execution. Any row at 2 needs a named owner and a line in the plan's deviations table.

## The rubric

| # | Dimension | What a 5 looks like | Typical leak |
|---|---|---|---|
| 1 | **Goal fidelity** | The plan's goal sentence matches the PRD phase row. Any narrowing is a decision-log entry, not an edit to the PRD goal cell. | Plan quietly drops a deliverable, then "marks the phase done". |
| 2 | **Claim verification** | Every "X supports Y" or "X requires Y" has a probe (a command with expected output) or a citation the reviewer opened. Versions were resolved against the registry on a stated date. | Framework behaviour asserted from memory (env loading, module resolution, hook signatures). |
| 3 | **Executability** | Each step runs as written on the environment the plan names. Prerequisites are checked by a script, not by prose describing the machine. | Plan hard-codes machine state ("your Node is 23.6") that is already stale. |
| 4 | **Production parity** | The plan exercises `build` and `start` for every service, not only `dev`. CI runs tests against the built artefact. | "Green in CI" means green under hot-reload dev servers only; the deploy path has never been executed. |
| 5 | **Boundary enforcement** | Package and server/client boundaries are enforced by tooling (subpath exports, lint rules, `server-only`), not by a paragraph. | A browser component imports a barrel that re-exports the DB driver. |
| 6 | **Test determinism** | Tests wait on the state they assert on, not on a proxy for it. Tests pass from a dirty local state and from a clean CI state. | Asserting after `connected` when the data arrives on `synced`. |
| 7 | **Config contract** | One env source of truth that every process (web, worker, CLI tool, CI) actually reads. Missing config fails loudly; nothing silently defaults to localhost. | Root `.env.local` that one of the services never loads. |
| 8 | **Dependency risk** | Exact pins. Newest major only if it has at least one patch and is at least two weeks old, or the plan names the fallback and the step that would expose the failure. Type packages match the runtime major. Container images pinned to a tag. | `.0.0` releases pinned two days after publish; `@types/node` two majors ahead of Node. |
| 9 | **Consistency with `docs/`** | Every deviation from `docs/` is in the plan's deviations table with a reason, and either updates the doc or adds a backlog row. Deviations from `PRD.md` go to the decision log. | Deviation applied in code, docs left contradicting it, next session "fixes" it back. |
| 10 | **Process hygiene** | One commit per task, each independently revertable. Gates (hooks, CI) exist before the commits they are meant to guard, or the plan says why not. Retired files are deleted, not committed. | Plan commits `PLAN.md` that `CLAUDE.md` calls retired. |
| 11 | **Security posture for the phase** | Every stub that weakens security is marked, has a removal phase, and cannot start in production (a one-line guard). Secrets are generated, never placeholder strings that might survive. | Permissive `onAuthenticate` with no production guard reaches Stage 2. |
| 12 | **Scope discipline** | Nothing speculative; nothing the phase needs is missing. Unused dependencies are absent. Throwaway code is labelled throwaway. | A logger in `dependencies` that nothing imports; an error branch that can never execute. |
| 13 | **Definition of done** | Every DoD line is a command with an expected result, and the set covers dev, build, test, and CI. | "Under 60 seconds" with nothing that measures it. |

## Review procedure

1. Read the PRD phase row and stage gate first, then the plan. Score row 1 before reading any code.
2. For rows 2, 4, 7: pick the three claims that would hurt most if wrong and verify them by running something. Package the probes into the review so the next reviewer can rerun them.
3. Score the rest. Write the evidence column even for 4s and 5s so the score is auditable.
4. Rank findings by "cost if discovered during the build", the same ordering `docs/prd-review-2026-09-05.md` uses.
5. Every blocking finding gets a concrete patch, not a suggestion. Every accepted risk gets a row in the plan's deviations table.
6. Record the review at `docs/plan-review-<phase>-<date>.md`, and add a `Reviewed:` line at the top of the plan pointing to it.

## Process rules this rubric encodes

- **Plans describe the target, `pnpm doctor` describes the machine.** Never bake the current Node version, daemon state, or uncommitted files into a plan.
- **A phase is not done until its production path has run once**, even if that path only runs on the laptop. Dev-mode-only green is the most expensive kind of green.
- **Prose boundaries rot; tooled boundaries hold.** If a rule matters enough to write down, add the lint rule or the export map that enforces it.
- **Deviations have exactly one home.** PRD deviations go to `PRD.md` §10. `docs/` deviations go to the backlog in `docs/prd-review-2026-09-05.md` §3 until the doc is fixed.
- **"Latest" is a policy, not a lookup.** Pin the newest release that has survived contact with users; record the fallback for anything newer than two weeks.
