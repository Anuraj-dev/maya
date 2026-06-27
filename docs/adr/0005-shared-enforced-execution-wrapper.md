# ADR 0005: A shared enforced-execution wrapper is the only sanctioned tool path

- Status: accepted for planning
- Date: 2026-06-27
- Related: ADR 0002 (CLI is canonical), ADR 0003 (declarative registry)

## Context

Safety and audit policy currently live *inside the MCP adapter* (`src/mcp/server.ts`): the payment
hard-gate (`confirm:true`), the catastrophic-shell gate, append-only audit logging, the `undo`
tool, and image-block conversion. The raw `tool.execute()` in the `buildTools()` registry is
unguarded — gates are applied only by the MCP wrapper. When the CLI becomes canonical (ADR 0002),
a call like `maya tool call shell_run …` would hit the raw executor and bypass the catastrophic
gate and the audit log. That is a safety regression hidden inside the refactor.

## Decision

Extract a single shared **enforced-execution wrapper**, `runTool(name, input)`, that applies audit
logging, the payment and catastrophic-shell gates, and undo-snapshotting around the pure executor.
Both adapters route through it and add only formatting: MCP converts `returnsImage` paths to image
blocks and speaks the protocol; the CLI emits the `{ok, version, command, data|error}` envelope.
The raw executors in the registry stay pure; the wrapper is the *only* sanctioned execution path.
"No adapter bypasses safety" becomes a structural, testable guarantee at the wrapper seam.

Consequently the old "extract reusable core" work splits:

- **Safety/audit/undo wrapper — required and early**, a prerequisite for any action command.
- **Broader core-layer extraction — still incremental/future**, only as concrete needs arise.

## Consequences

- Action commands cannot ship before the wrapper exists.
- Audit/undo coverage is identical across MCP and CLI by construction.
- The wrapper seam is the primary test boundary for safety parity.
