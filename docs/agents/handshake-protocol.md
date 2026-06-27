# Coder ⇄ Reviewer handshake protocol

Two single-purpose agents collaborate on one slice (one issue = one PR) by talking through
**GitHub PR comments**. They never call each other directly; the PR is the shared state.

## Roles (strict, non-overlapping)

- **Coder** — may create branches, implement code + tests, push, open PRs, and **merge**. Runs the
  build model (Sonnet 4.6 high by default; Opus for #21/#22). May post only handshake comments and a
  short change summary. **Must not** review its own work or edit a reviewer verdict.
- **Reviewer** — may **only read** the PR diff and **post comments**. Runs a *different* model
  (GPT-5.5) for independence. **Must never** edit code, push, or merge.

## The signal

Every coordination comment's **first line** is a machine-greppable marker:

```
### HANDSHAKE: <SIGNAL>
```

`<SIGNAL>` is one of:

| Signal | Posted by | Means |
|---|---|---|
| `READY_FOR_REVIEW` | coder | slice implemented, tests green, please review |
| `NEEDS_CHANGES` | reviewer | issues found; numbered list follows; coder must address |
| `APPROVED` | reviewer | no changes needed; coder may merge |
| `MERGED` | coder | PR merged, issue closed, slice done |

**Current state = the SIGNAL on the most recent handshake comment** (by `created_at`). Read it with:

```bash
gh pr view <PR> --json comments \
  --jq '[.comments[] | select(.body|test("^### HANDSHAKE:"))] | last | .body' \
  | head -1
```

## State machine

```
(no PR) --coder implements--> READY_FOR_REVIEW
READY_FOR_REVIEW --reviewer--> NEEDS_CHANGES --coder fixes--> READY_FOR_REVIEW   (loop)
READY_FOR_REVIEW --reviewer--> APPROVED --coder merges--> MERGED --> next slice
```

## Cadence

Each agent runs **one tick** every 3 minutes via `/loop 3m <its prompt>`. A tick reads the current
state, acts only if it is that agent's turn, otherwise reports "waiting" and yields until the next
tick. Whoever is not on-turn does nothing but poll.

- Coder acts when state is: none / `NEEDS_CHANGES` / `APPROVED`.
- Reviewer acts when state is: `READY_FOR_REVIEW`.
- Otherwise: wait.

## Testing runs in CI only — never locally (RAM priority)

Saving device RAM is a priority. **Neither agent ever runs `bun test` (or any test/typecheck) on its
own machine.** Tests run remotely in GitHub Actions (`.github/workflows/ci.yml`, the `bun test` job)
on every push to a PR. Agents learn pass/fail by **reading CI status**, not by executing tests:

```bash
gh pr checks <PR> --watch=false        # current check states
gh run view <run-id> --log-failed      # only the failing logs, if red
```

- The coder pushes, lets CI run, and **posts `READY_FOR_REVIEW` only after the CI `bun test` job is
  green** — never based on a local run.
- If CI is red, the coder reads the failing logs from CI and fixes by TDD, then pushes again. It does
  not reproduce the failure locally.
- The reviewer confirms CI is green as part of its review and **also never runs tests locally**.
- This rule holds as long as CI exists. CI already exists for this repo, so it holds from slice #22
  onward.

## Invariants

- Tests are `bun:test`, colocated `*.test.ts`; they are *authored* locally but *executed only in CI*.
  Every PR must end with the CI `bun test` job green, including all pre-existing tests (the S4
  regression guard — present features stay intact).
- TDD only: one test → minimal impl → repeat (vertical slices, never all-tests-first).
- One slice in flight per coder/reviewer pair. Finish and merge #22 before starting the next.
- Branches: `feat/<issue-number>-<slug>`. PRs target the integration branch and use `Closes #<n>`.
