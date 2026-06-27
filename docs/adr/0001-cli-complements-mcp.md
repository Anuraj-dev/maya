# ADR 0001: CLI complements MCP through shared implementations

- Status: superseded by ADR 0002
- Date: 2026-06-27

## Context

Maya exposes more than thirty local capabilities through MCP. MCP discovery sends the complete tool
catalog, descriptions, and JSON schemas to clients, which is useful for open-ended capability use but
context-heavy for a coding agent that already knows the one operation it needs.

Maya also has an existing Commander CLI, while tool metadata and execution are assembled in
`src/tools/index.ts`. Safety and auditing are partly applied in the MCP adapter.

## Decision

Keep MCP as a supported interface and evolve the CLI into a low-context, agent-first interface.
Implement discovery commands before action commands. CLI and MCP adapters must invoke shared behavior;
the CLI must not copy business logic from `src/tools/*` or bypass safety/audit policy.

Use concise deterministic text by default and plan an explicit versioned `--json` format. Keep the
first docs indexes local, versioned, and hand-maintained until deterministic generation and validation
are designed.

## Consequences

- Existing MCP clients and rich image responses remain supported.
- Current CLI commands must remain compatible while command groups are added.
- Some MCP adapter responsibilities need an explicit reusable boundary before action commands land.
- Discovery commands can ship without Playwright, voice, reminder, or process initialization.
- This documentation cycle does not extract a core layer or implement the new commands.
