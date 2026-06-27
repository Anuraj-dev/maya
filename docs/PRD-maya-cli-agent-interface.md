# PRD: Maya CLI as canonical agent interface (MCP demoted)

- Status: planning complete; implementation not started
- Date: 2026-06-27
- Supersedes: the prior "CLI complements MCP" PRD of the same filename
- Governing decisions: ADR 0002 (CLI canonical, MCP demoted), ADR 0003 (declarative registry
  replaces Commander), ADR 0004 (discovery via generated skill), ADR 0005 (shared enforced-execution
  wrapper)

## Problem Statement

Maya is a local automation **body**; the **brain** is an external coding agent (Claude Code / Codex).
Today that brain drives Maya over MCP, which forces the agent to load 30+ tool names, descriptions,
and JSON schemas into context **every session** — even when it only needs one operation, or never
touches Maya at all. That always-on catalog is the dominant token cost of using Maya, it competes with
the code context the agent actually needs, and it locks Maya to MCP-capable hosts. Raja wants Maya to
do everything she does now, but without paying the MCP context tax — and to be able to drop MCP
entirely once a leaner interface proves itself.

## Solution

Make a **CLI the canonical interface** to Maya's body, and let the external brain drive Maya by
shelling out to `maya …` instead of MCP tool-calls. The brain discovers Maya through a **generated
agent skill** whose one-line description auto-activates only when Maya is relevant (browser, screen,
shell, files, …); the skill body and the `maya capabilities` contract are pulled **on demand**. This
replaces an always-on 30-schema dump with a resting cost of ~1 line.

The CLI presents a **dual-layer surface**: a generic dispatcher (`maya tool call <name>`) that makes
every registered tool callable the day it ships — the parity guarantee — plus curated
`maya <group> <action>` commands grown incrementally for high-traffic tools. Both the CLI and the
(now demoted) MCP adapter route through **one shared enforced-execution wrapper** so safety, audit, and
undo can never be bypassed. MCP is kept as an optional, no-longer-invested-in pass-through; its hard
removal is a separately-scoped follow-up triggered only after the CLI has proven itself.

Continuous voice (the always-on listen→reason→speak loop) is explicitly deferred.

## User Stories

1. As a coding agent, I want to discover Maya through a skill that activates only when relevant, so that I do not carry Maya's tool catalog in context when I am not using her.
2. As a coding agent, I want one `maya capabilities` call to return the full command contract, so that I can learn Maya's surface on demand instead of pre-loading every schema.
3. As a coding agent, I want `maya tool list` to show one line per tool, so that I can scan capabilities without loading their schemas.
4. As a coding agent, I want `maya tool describe <name>` to return exactly one tool's contract, so that I pull a schema only when I have decided to use it.
5. As a coding agent, I want `maya tool call <name> --json '{…}'` to invoke any registered tool, so that the CLI can do everything MCP did from day one.
6. As a coding agent, I want every command to support a `--json` envelope `{ok, version, command, data|error}`, so that I can parse results deterministically without prose.
7. As a coding agent, I want concise deterministic text by default, so that interactive transcripts stay small.
8. As a coding agent, I want a stable error-code taxonomy (invalid_command, invalid_option, unauthenticated, forbidden, not_found, conflict, network_failed, validation_failed, …), so that I can branch on failure kinds.
9. As a coding agent, I want `maya screenshot` to return a file path plus dimensions, so that I can view the image with my own file-reading capability instead of needing MCP image blocks.
10. As a coding agent, I want `maya browser navigate/click/read/screenshot` as curated commands, so that common browser control reads naturally and is self-documenting.
11. As a coding agent, I want `maya find <query>` across files, tools, docs, and commands, so that I can locate context with one bounded command instead of scanning the repo.
12. As a coding agent, I want `maya docs query <query>` and `maya docs index --check`, so that I can read curated docs and trust the index is valid.
13. As a coding agent, I want destructive operations to keep their gates (payment confirm, catastrophic-shell block) regardless of whether I call them via CLI or MCP, so that the canonical path is not a safety downgrade.
14. As a coding agent, I want every side-effecting call audited and undoable (`maya undo`), so that I can reverse a file write or delete.
15. As a human developer, I want `maya doctor` to report Bun/config/index health, browser/desktop/voice dependencies, and whether the Maya skill is installed in each agent, so that I can diagnose Maya without attaching an MCP client.
16. As a human developer, I want `maya setup` to install/refresh the Maya skill into both `~/.claude/skills/` and `~/.codex/skills/`, so that either agent discovers Maya with one command.
17. As a human developer, I want `maya ask`, `maya start/stop/status`, `maya live`, and `maya ping` to keep working, so that existing terminal and daemon workflows are not broken by the rewrite.
18. As a maintainer, I want the skill body generated from the command registry, so that discovery content cannot drift from the real CLI.
19. As a maintainer, I want a single `COMMAND_SPECS` registry as the source of truth for help, validation, capabilities, and dispatch, so that there is no second parser or duplicated definition.
20. As a maintainer, I want a test proving every registered tool is reachable via the dispatcher and listed in capabilities, so that "parity with MCP" is enforced, not assumed.
21. As a maintainer, I want MCP list/call behavior covered by regression tests after the safety wrapper is extracted, so that demoting MCP does not change its behavior.
22. As a maintainer, I want discovery commands to run without starting Playwright, TTS, reminders, the daemon, or MCP, so that lookups stay cheap.
23. As Raja, I want MCP demotion separated from MCP deletion, so that the irreversible step never blocks the build and I can delete MCP on my own terms once the CLI is proven.
24. As a future agent, I want current behavior, planned behavior, and known gaps documented separately, so that I do not mistake roadmap entries for implemented features.

## Implementation Decisions

- **Direction (ADR 0002):** the CLI is Maya's canonical, documented interface; the external brain
  shells out to `maya …`; MCP is demoted to an optional pass-through, not deleted in this cycle.
- **Parser (ADR 0003):** replace Commander with a hand-rolled **declarative command registry** under a
  new `src/cli/` module. A single `COMMAND_SPECS`-style array is the source of truth; help, argument
  validation, the `capabilities` contract, and dispatch are derived from it. Reference design:
  Pravah's `packages/cli` (`commandSpec.ts`, `envelope.ts`, `args.ts`, `commands.ts`, `errors.ts`).
- **Output:** concise deterministic text by default; `--json` emits the versioned envelope
  `{ok, version, command, data|error}`. A message→error-code classifier provides a stable taxonomy.
- **Command surface (ADR 0003):** dual-layer — a generic dispatcher (`maya tool call/list/describe`)
  straight over `buildTools()` as the parity guarantee, plus curated `maya <group> <action>` commands
  added incrementally for high-traffic tools. `maya capabilities` lists both.
- **Existing commands** (`start/stop/status/mcp/setup/ask/ping/live`) migrate into specs with behavior
  preserved; `maya ask`/`runOnce` keep their current entry and semantics.
- **Images (ADR 0002):** a successful `returnsImage` result yields a file path (plus dimensions in
  JSON); the brain views it with its own file/image-reading capability. The `returnsImage`→image-block
  coupling moves out of the core: MCP wraps the path as a block, the CLI prints the path.
- **Safety wrapper (ADR 0005):** extract a shared `runTool(name, input)` that applies audit logging,
  the payment and catastrophic-shell gates, and undo-snapshotting around the pure executor. Both
  adapters route through it; it is the only sanctioned execution path. This extraction is **required
  and early** — a prerequisite for any action command — not a someday refactor.
- **Discovery (ADR 0004):** `maya setup` stops registering an MCP server and instead installs/refreshes
  a generated `maya` skill into `~/.claude/skills/maya/` and `~/.codex/skills/maya/`. The skill
  `description` enumerates trigger scenarios; the body is thin and generated from the registry and
  points to `maya capabilities` and `maya tool describe`.
- **Demotion vs deletion:** `maya serve`/`maya mcp` keep running the demoted MCP adapter over the shared
  wrapper. Hard removal of the MCP server, its setup path, and `@modelcontextprotocol/sdk` is a separate
  future issue, gated on the CLI reaching proven parity.
- **Docs-index:** a versioned local JSON catalog of files, tools, and commands feeds both `maya find`
  and skill generation; a validation command checks schema, duplicate names, missing paths, and
  registry coverage.

## Testing Decisions

Tests verify external behavior through public interfaces, not implementation. Issues follow the TDD
workflow: a behaviors-to-test list, then vertical RED→GREEN tracer-bullet cycles (one test → one
implementation), never a horizontal "all tests first" pass. Runner is `bun:test`; prior art is the
pure-core style of `src/safety/catastrophic.test.ts` and the service tests under `src/system` and
`src/proactive`.

Seams (confirmed with Raja):

- **S1 — CLI process boundary.** Spawn `maya …` and assert exit code, stdout (text and `--json`
  envelope), and stderr for help, invalid usage, empty matches, bounded/truncated matches, missing
  dependencies, policy blocks, and execution failures. This is the primary product contract.
- **S2 — Enforced-execution wrapper.** Assert the payment gate, catastrophic-shell gate, audit append,
  and undo-snapshot fire through `runTool` regardless of caller — the "no adapter bypasses safety"
  guarantee.
- **S3 — Registry ↔ capabilities parity.** Assert every tool in `buildTools()` is reachable via
  `maya tool call` and listed in `maya capabilities`.
- **S4 — MCP regression.** Assert existing MCP list/call behavior is unchanged after the wrapper is
  extracted — the guard that present features remain intact.
- **S5 — Skill generation.** Assert `maya setup` emits skill content derived from the registry (no
  drift), into each configured agent's skills directory.
- **S6 — Capabilities snapshot.** Assert deterministic `maya capabilities` output and a versioned JSON
  contract; keep query/ranking tests table-driven and deterministic.

Real browser, desktop, voice, and system dependencies stay behind a thin manual smoke checklist rather
than the automated seams above.

## Out of Scope

- Hard deletion of the MCP server, its setup path, or the MCP SDK dependency (separate future issue).
- The continuous voice listen→reason→speak loop and any always-on daemon voice work.
- A general-purpose interactive shell, TUI, or shell completion.
- Embeddings, a vector database, a remote index service, or an LLM in the query path.
- A broad core-layer extraction beyond the safety/audit/undo wrapper (kept incremental).
- New DNS, system-state, audio, media, or desktop-control capabilities Maya does not already implement.
- Rewriting the legacy brain, daemon, or overlay systems.

## Further Notes

The win is measured in resting tokens: an always-on ~30-schema MCP catalog becomes a ~1-line skill
description, with the real contract pulled on demand. The skill, the generic dispatcher, and the
shared wrapper together make "CLI replaces MCP" true immediately and safely, while the demotion → later
deletion split keeps the irreversible step off the critical path. Docs and the index are inputs to the
CLI, not a parallel documentation project; their value is fewer file scans, smaller agent context, and
faster orientation.
