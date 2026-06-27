# Architecture

## Runtime summary

Maya is a Bun-native TypeScript project with four active surfaces:

1. `src/index.ts` is the Commander CLI entry point.
2. `src/mcp/server.ts` exposes Maya tools over MCP stdio.
3. `src/agent/loop.ts` runs the legacy in-process LLM path used by `maya ask`, `maya live`, and the daemon.
4. `overlay/` is a React/Vite/Electron status UI connected through a WebSocket bridge in the current live path.

The repository has no compile-to-JavaScript build step for the main process. Bun runs `src/index.ts`
directly. TypeScript validation is `bun run typecheck`; tests use Bun's test runner.

## Current dependency flow

```text
src/index.ts
  +-- start/stop/status --> src/daemon/service.ts
  +-- ask -------------> src/agent/loop.ts --> src/brain/*
  +-- live ------------> src/overlay/live-run.ts --> agent loop
  +-- mcp -------------> src/mcp/server.ts
  +-- setup -----------> src/mcp/setup.ts

src/mcp/server.ts
  +-- loadConfig() -----------------> src/config/index.ts
  +-- buildTools(config, deps) -----> src/tools/index.ts --> src/tools/*.ts
  +-- MCP list/call handlers ------> @modelcontextprotocol/sdk
  +-- payment/catastrophic gates --> src/safety/*
  +-- audit/undo/retention ---------> src/safety/audit.ts
  +-- runtime dependencies --------> reminders, process manager, TTS, listen
```

## Tool architecture

`src/tools/index.ts` defines `ToolSpec`, `MayaTool`, and `buildTools()`. Each module in `src/tools/`
returns a record containing both agent-facing metadata (`name`, `description`, JSON input schema) and
an `execute()` function. `buildTools()` merges those records.

The MCP server adds three transport-local tools after calling `buildTools()`:

- `listen`
- `speak`
- `undo`

It converts all specs to MCP `Tool` objects, serves them from `ListTools`, and dispatches `CallTool`
requests to the matching `execute()` function. Image-returning tools return a path internally; the
MCP adapter reads that path and emits an MCP image block.

This is the main future reuse seam. A CLI should call the same execution services as MCP. It should
not reimplement Playwright, shell execution, file safety, reminders, or process management. The
current spec-plus-executor objects can be adapted first; extraction into separate core services
should happen only where tests show the adapter cannot reuse them cleanly.

## Browser and form control

`src/tools/browser.ts` owns one module-level persistent Playwright Chromium context. Its profile is
stored at `config.browser.profileDir`, so browser login state survives. The browser can navigate,
read ARIA snapshots, click and type by accessible labels, fall back to CSS selectors, evaluate page
JavaScript, scroll, press keys, and capture the visible page.

Form filling is not a separate subsystem. It is implemented by `browser_type` and
`browser_type_selector`, with optional Enter submission.

## Screenshots and sensing

Screenshot behavior has two implementations:

- `browser_screenshot` in `src/tools/browser.ts` captures the current Playwright page to `/tmp`.
- `screenshot` in `src/tools/sensing.ts` captures the desktop using `grim`, then KDE `spectacle`,
  then ImageMagick `import`; its default output is under `~/.config/maya/screenshots`.

Both set `returnsImage`, allowing the MCP adapter to convert the returned file into an image block.
The sensing module also implements clipboard access and active-window context.

## Terminal and process control

`shell_run` in `src/tools/shell.ts` executes `/bin/sh -c`, has a 30-second timeout, and truncates
combined output at 8,000 characters. The MCP adapter applies catastrophic-command classification and
auditing around it.

Long-running commands use `proc_start`, `proc_list`, `proc_logs`, and `proc_stop` from
`src/tools/process.ts`. Their stateful implementation is `src/system/processes.ts`; the MCP server
constructs one process manager per server session and injects it into `buildTools()`.

There is currently no DNS-specific tool and no implemented general PC/system-state tool. `plan.md`
describes `system_state`, audio, media, network, and desktop control as future work; tests contain TODOs
for some of them. Agents must not present roadmap entries as implemented capabilities.

## Configuration and state

`src/config/index.ts` validates `~/.config/maya/config.json` with Zod. `MAYA_DIR` can relocate all Maya
state. Bun auto-loads repository `.env`; API keys may come from environment variables, with config
file values as fallback for the legacy brain path. Browser profile, audit data, reminders, managed
process logs, screenshots, memory, sockets, and PID data live below `MAYA_DIR`.

`.env.example` currently documents Anthropic and Gemini keys. `.env` and `.env.local` are ignored.

## Safety boundary

The MCP call adapter, not each tool module, currently owns auditing, payment confirmation,
catastrophic shell confirmation, retention startup, undo exposure, and MCP error conversion. A future
CLI action adapter must preserve the same policies. Discovery commands such as `find`, `tools list`,
and `docs query` should remain read-only and should not initialize expensive runtime dependencies.

## Do not refactor yet

- Do not move every `src/tools/*` module into a new directory merely to create a `core` label.
- Do not duplicate `execute()` logic in CLI handlers.
- Do not remove the MCP server or its stdio transport.
- Do not merge browser and desktop screenshots; they have different runtimes and outputs.
- Do not treat the older brain/daemon/overlay roadmap as completed architecture.
- Do not change tool names or schemas as part of docs/index work.
