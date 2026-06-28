# File map

Use this map before searching the full repository.

## Entrypoints and adapters

| Path | Responsibility |
|---|---|
| `src/index.ts` | CLI entrypoint delegating into the declarative registry |
| `src/cli/` | Declarative command specs, parser, help, capabilities, and JSON envelope |
| `src/mcp/server.ts` | MCP stdio lifecycle, tool exposure, safety/audit wrapper, image conversion |
| `src/mcp/setup.ts` | Claude Code/Codex MCP registration |
| `src/agent/loop.ts` | Legacy in-process agent loop used outside MCP |
| `src/agent/system-prompt.ts` | Legacy brain instructions and browser strategy |
| `src/daemon/service.ts` | Legacy daemon, clipboard voice input, TTS, overlay/session orchestration |

## Tools and execution

| Path | Responsibility |
|---|---|
| `src/tools/index.ts` | Shared `MayaTool` contract and registry assembly |
| `src/tools/browser.ts` | Playwright browser lifecycle, forms, page screenshot |
| `src/tools/shell.ts` | Bounded one-shot shell execution |
| `src/tools/process.ts` | Agent-facing managed process tools |
| `src/system/processes.ts` | Managed process implementation and logs |
| `src/tools/file.ts` | Read/write/delete file actions |
| `src/tools/sensing.ts` | Desktop screenshot, clipboard, active-window context |
| `src/tools/app.ts` | Native app/file/URL launch |
| `src/tools/vault.ts` | Obsidian `ob` CLI adapter |
| `src/tools/memory.ts` | Persistent memory tool adapter |
| `src/memory/store.ts` | Persistent memory JSON store |
| `src/tools/proactive.ts` | Notifications and reminder tool adapter |
| `src/proactive/reminders.ts` | Reminder persistence and scheduling |
| `src/tools/voice.ts` | Dependency-gated `voice_ask` tool |

## Configuration, safety, and voice

| Path | Responsibility |
|---|---|
| `src/config/index.ts` | Zod config schema and `MAYA_DIR` paths |
| `src/safety/audit.ts` | Audit, snapshots/trash, undo, retention wiring |
| `src/safety/floor.ts` | Action category classification |
| `src/safety/catastrophic.ts` | Catastrophic shell pattern classification |
| `src/safety/redact.ts` | Audit secret redaction |
| `src/safety/retention.ts` | Pure retention selection and undo bounding |
| `src/voice/listen.ts` | Current MCP listening adapter |
| `src/voice/tts.ts` | Piper/sox/paplay TTS implementation and fallback |
| `src/voice/ports.ts` | Proposed voice rearchitecture ports |
| `src/voice/turn.ts` | Pure future voice-turn state machine |

## Overlay and IPC

| Path | Responsibility |
|---|---|
| `src/overlay/bridge.ts` | WebSocket snapshot bridge used by live mode |
| `src/overlay/live-run.ts` | Runs a command while keeping bridge active |
| `src/overlay/session.ts` | Converts agent events to overlay snapshots |
| `src/ipc/types.ts` | Versioned daemon/overlay IPC types |
| `src/ipc/server.ts` | Placeholder IPC interface; full server remains TODO |
| `overlay/src/` | React renderer |
| `overlay/electron/` | Electron main/preload processes |
| `overlay/host.py` | Alternate overlay host artifact |

## Product and planning documents

| Path | Meaning |
|---|---|
| `README.md` | Original project overview and development quick start |
| `PRD.md` | Original voice-agent PRD |
| `plan.md` | Capability expansion roadmap; includes unimplemented work |
| `plan-production.md` | Voice/production roadmap; includes implemented seeds and future work |
| `docs/` | Current agent navigation and CLI-first planning docs |
| `docs-index/` | Lightweight machine-readable discovery foundation |

## Tests

Tests are colocated under `src/**/*.test.ts`. Existing coverage includes CLI process-contract tests,
effort selection, clipboard command parsing, reminders/processes, safety/audit/retention, TTS helpers,
and the future voice-turn reducer. Browser tool coverage is still absent; docs-index validation now
lives in `src/docs-index/validate.test.ts`.
