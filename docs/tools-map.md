# Tools map

Maya tool names use underscores because provider tool-name rules allow `[a-zA-Z0-9_-]`. The source
registry lives in `src/tools/index.ts`; the MCP adapter adds three transport-local tools in
`src/mcp/server.ts` (`listen`, `speak`, `undo`).

Every active headless tool in the registry is reachable through the CLI generic dispatcher
(`maya tool call <name> --json '{"arg":"value"}'`). Execution routes through `runTool` (ADR 0005),
while `maya tool list` and `maya tool describe` provide progressive discovery.

## Browser

Source: `src/tools/browser.ts`. Runtime: one persistent Playwright Chromium context using the configured
profile directory.

| Tool | Purpose | Future CLI direction |
|---|---|---|
| `browser_navigate` | Navigate and return title plus ARIA snapshot | `maya browser navigate` (future) |
| `browser_read` | Read current page as an ARIA snapshot | `maya browser read` (future) |
| `browser_click` | Click by visible/accessibility text | `maya browser click` (future) |
| `browser_click_selector` | Click a CSS selector | `maya browser click` (future advanced option) |
| `browser_type` | Fill a field by label/placeholder/ARIA name | `maya browser type` (future) |
| `browser_type_selector` | Fill a selector, including contenteditable | `maya browser type` (future advanced option) |
| `browser_press_key` | Press a browser key | `maya browser key` (future) |
| `browser_eval` | Evaluate JavaScript in the current page | deferred high-risk command |
| `browser_scroll` | Scroll page or selected container | `maya browser scroll` (future) |
| `browser_screenshot` | Capture visible Playwright page | `maya browser screenshot --out` |

## Terminal and processes

| Tool | Source | Purpose | CLI command |
|---|---|---|---|
| `shell_run` | `src/tools/shell.ts` | One-shot `/bin/sh -c`, 30-second limit | `maya terminal run` |
| `proc_start` | `src/tools/process.ts` | Start managed background command | `maya proc start` |
| `proc_list` | `src/tools/process.ts` | List persistent managed processes | `maya proc list` |
| `proc_logs` | `src/tools/process.ts` | Tail bounded managed-process output | `maya proc logs` |
| `proc_stop` | `src/tools/process.ts` | Stop a managed process group | `maya proc stop` |

`src/system/processes.ts` persists process metadata and log paths under `MAYA_DIR/proc`. CLI and MCP
construct the same manager and execute the same tools through `runTool`.

## Files and apps

| Tool | Source | Purpose |
|---|---|---|
| `file_read` | `src/tools/file.ts` | Read a text file, truncated at 10,000 characters |
| `file_write` | `src/tools/file.ts` | Create or overwrite with snapshot support |
| `file_delete` | `src/tools/file.ts` | Move one file into Maya trash |
| `app_open` | `src/tools/app.ts` | Launch known desktop apps or use `xdg-open` |

Typed directory listing, tree, and file finding do not exist yet. The planned `maya files map` should
read `docs-index/files.json`; it is not a wrapper around an existing MCP tool.

## Sensing

Source: `src/tools/sensing.ts`.

| Tool | Purpose |
|---|---|
| `screenshot` | Capture the desktop with `grim`, `spectacle`, or ImageMagick `import` |
| `clipboard_read` | Read Wayland clipboard through `wl-paste` |
| `clipboard_write` | Write Wayland clipboard through `wl-copy` |
| `get_context` | Get active window using Hyprland, KDE, or X11-specific paths |

No general `system_state`, DNS, network, audio, or media tool is currently registered. Those names in
`plan.md` are roadmap items.

## Obsidian, memory, reminders

| Tool | Source | Purpose |
|---|---|---|
| `vault_read` | `src/tools/vault.ts` | Read an Obsidian note through the `ob` CLI |
| `vault_search` | `src/tools/vault.ts` | Search the vault |
| `vault_append` | `src/tools/vault.ts` | Append to/create a note |
| `vault_write` | `src/tools/vault.ts` | Replace a note |
| `memory_save` | `src/tools/memory.ts` | Add/update a fact in Maya memory |
| `memory_forget` | `src/tools/memory.ts` | Remove a memory fact |
| `notify` | `src/tools/proactive.ts` | Send a desktop notification |
| `remind` | `src/tools/proactive.ts` | Persist a timed notification/spoken reminder |
| `reminders_list` | `src/tools/proactive.ts` | List pending reminders |
| `reminder_cancel` | `src/tools/proactive.ts` | Cancel a pending reminder |

Reminder behavior is implemented in `src/proactive/reminders.ts` and injected into tool construction.

## Voice and MCP-local tools

| Tool | Registration | Purpose |
|---|---|---|
| `voice_ask` | `src/tools/voice.ts`, only with `voiceAsk` dependency | Ask and wait for spoken input in daemon/live paths |
| `listen` | `src/mcp/server.ts` | Open/wait for microphone transcription |
| `speak` | `src/mcp/server.ts` | Speak through the configured TTS backend |
| `undo` | `src/mcp/server.ts` | Undo the last reversible file operation |

The MCP server does not inject `voiceAsk`; it exposes `listen` and `speak` instead.

## Update rule

When a tool name, description, source, dependency gate, or proposed CLI mapping changes, update this
file and `docs-index/tools.json` together.
