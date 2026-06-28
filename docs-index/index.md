# Maya docs index

This directory is the first local discovery database for Maya's future agent-first CLI.

| File | Entries | Purpose |
|---|---:|---|
| `files.json` | curated important files | power `maya files map` and file results in `maya find` |
| `tools.json` | implemented tool catalog | power `maya tools list/describe` and tool results in `maya find` |
| `commands.json` | implemented and planned CLI commands | distinguish current behavior from roadmap |

All indexes use `schemaVersion: 1`. They are hand-maintained in this cycle. Entries contain a concise
description, source or planned path, related documentation, MCP/CLI mapping where applicable,
keywords, and guidance for when an agent should use the entry.

## Important interpretation rules

- `status: "planned"` commands do not exist yet.
- A null future command means no CLI exposure has been designed.
- `voice_ask` is implemented but is not registered by the MCP server; it is dependency-gated in
  legacy daemon/live use.
- DNS and general system-state capabilities are absent from the implemented tool index because they
  are roadmap items, not current tools.
- Source code remains the behavioral source of truth.

## Validation

`src/docs-index/validate.ts` validates JSON schema versions, duplicate names, referenced paths,
`buildTools()` coverage, dependency-gated markers, and deterministic name ordering. Its public seam
is covered by `src/docs-index/validate.test.ts`; a future `maya docs index --check` command can call
the same module.
