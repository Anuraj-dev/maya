# ADR 0002: The CLI becomes Maya's canonical interface; MCP is demoted, not deleted

- Status: accepted for planning
- Date: 2026-06-27
- Supersedes: ADR 0001 (CLI complements MCP)

## Context

ADR 0001 framed the CLI as a low-context *complement* to MCP, with MCP preserved as the
primary capability protocol. In practice the external coding agent (Claude Code / Codex) is
Maya's brain, and loading 30+ MCP tool schemas into that agent's context on every session is
the dominant token cost. The MCP server is already a thin adapter over the `buildTools()`
registry (`src/tools/index.ts`), so a CLI adapter over the same registry can reach full
capability parity.

## Decision

Evolve the CLI into Maya's **canonical, documented, primary** interface. The external brain
drives Maya by shelling out to `maya ...` commands instead of MCP tool-calls (see ADR 0003).
MCP is **demoted to an optional, no-longer-invested-in pass-through** over the same shared
behavior — it is *not* deleted in this cycle. Hard removal of the MCP server, its setup
command, and the `@modelcontextprotocol/sdk` dependency is deferred to a separately-scoped
follow-up issue, triggered only after the CLI has proven itself at parity in daily use.

Continuous voice (the always-on listen→reason→speak loop) is explicitly out of scope for this
cycle and reconsidered later.

## Consequences

- The "CLI complements MCP forever" premise in the current PRD and several GH issues is
  obsolete and must be rewritten; MCP-compatibility acceptance criteria become parity criteria.
- Both adapters keep invoking shared behavior; neither owns business logic or safety/audit.
- Deleting MCP becomes a small, reversible-by-revert mechanical change behind its own issue,
  so the irreversible step never blocks the build plan.
- Maya becomes brain-agnostic: anything with a shell can drive her, not only MCP hosts.
