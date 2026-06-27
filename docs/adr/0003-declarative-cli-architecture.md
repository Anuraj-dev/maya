# ADR 0003: Declarative command registry replaces Commander; dual-layer command surface

- Status: accepted for planning
- Date: 2026-06-27
- Related: ADR 0002 (CLI is canonical)

## Context

Maya's CLI is built on Commander (`src/index.ts`). The goal (ADR 0002) is an agent-shaped
contract: one `capabilities` call that replaces the MCP schema dump, deterministic output, and
a command registry that mirrors the `buildTools()` tool registry. Commander's help is tuned for
humans and its JSON/error story is loose, which works against that goal. The reference design is
Pravah's `packages/cli`: a single `COMMAND_SPECS` array from which help, validation, the
`capabilities` contract, and dispatch are all derived, plus a `{ok, version, command, data|error}`
envelope and message→error-code classification.

## Decision

Replace Commander with a hand-rolled **declarative command registry** (Pravah pattern) under a
new `src/cli/`. A single spec array is the source of truth; help, arg validation, `capabilities`,
and dispatch derive from it. Output is concise deterministic text by default with a `--json`
envelope (`{ok, version, command, data|error}`) and a stable error-code taxonomy.

The command surface is **dual-layer**:

- **Generic dispatcher** — `maya tool call <name> --json '{...}'` plus `maya tool list/describe`,
  straight over `buildTools()`. This is the *parity guarantee*: every registered tool is callable
  the day the CLI ships, with zero per-tool CLI code, so the CLI can replace MCP immediately.
- **Curated commands** — `maya <group> <action>` (e.g. `maya browser navigate <url>`) grown
  incrementally for high-traffic tools, each a typed spec with real flags.

Existing commands (`start/stop/status/mcp/setup/ask/ping/live`) migrate into specs; `maya ask`
keeps its current behavior and entry. There remains exactly one arg parser, just a better-fit one.

## Consequences

- The old PRD rule "extend the existing Commander CLI, do not add a second parser" is obsolete —
  it assumed the complement-MCP premise reversed by ADR 0002. There is still only one parser.
- New tools are callable immediately via the generic dispatcher; a curated command is optional
  ergonomic polish, not a parity blocker.
- `maya capabilities` becomes the agent's one-call contract, listing the generic dispatcher and
  every curated command.
