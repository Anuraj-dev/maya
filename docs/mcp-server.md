# MCP server

## Entry point

`maya mcp` is registered in `src/index.ts` and dynamically imports `startMcpServer()` from
`src/mcp/server.ts`. `maya setup [claude|codex]` uses each agent's own CLI to register the absolute Bun
and `src/index.ts` launch command rather than editing agent configuration files directly.

The transport is `StdioServerTransport` from `@modelcontextprotocol/sdk`.

## Startup flow

`startMcpServer()` performs these steps:

1. Load Zod-validated configuration.
2. Create the TTS backend.
3. run retention immediately and schedule a daily retention pass.
4. Create the persisted reminder service under `MAYA_DIR`.
5. Create a background process manager under `MAYA_DIR/proc`.
6. Build the standard tool registry with those runtime dependencies.
7. Add MCP-specific `listen`, `speak`, and `undo` tools.
8. Register `ListTools` and `CallTool` handlers.
9. Connect to stdio and remain active until stdin closes.

## Registration flow

`src/tools/index.ts` imports each tool group and merges it in `buildTools(config, deps)`. Dependency-
gated groups return an empty record when their service is unavailable. In the MCP path, reminders and
managed processes are injected, so the complete groups are available. `voice_ask` is not injected by
the MCP server; MCP instead exposes the separate `listen` and `speak` loop.

Tool specs use provider-neutral JSON Schema. The MCP adapter maps them directly to SDK `Tool` values.
The full catalog is listed in `docs/tools-map.md` and `docs-index/tools.json`.

## Call flow

For each tool call, the MCP adapter:

1. Rejects unknown names.
2. Applies the payment confirmation gate.
3. Applies catastrophic classification to `shell_run`.
4. Executes the selected `MayaTool`.
5. Converts image file paths into base64 MCP image blocks when `returnsImage` is set.
6. Writes success or failure to the audit log.
7. Converts thrown errors into MCP error results.

These adapter responsibilities must also be honored by future CLI action commands. Calling a tool's
`execute()` directly from a CLI handler without equivalent safety and auditing would be a regression.

## Why MCP is context-heavy

MCP clients discover the complete tool list, descriptions, and JSON input schemas. Maya currently has
more than thirty tool definitions across browser, files, shell, sensing, memory, vault, reminders,
processes, apps, and voice. That metadata is valuable for open-ended use but wasteful when an agent
only needs one known action or a repository lookup.

The CLI complements this model by making the command name itself the capability selector. An agent can
ask for `maya tools describe browser_screenshot` or run a focused action without carrying unrelated
tool definitions in the same context.

## Preserve

- MCP remains supported and continues to expose rich image responses.
- Existing MCP tool names and schemas remain stable unless separately versioned.
- MCP and CLI must use shared implementations.
- `maya setup` continues to use official client CLIs for registration.
