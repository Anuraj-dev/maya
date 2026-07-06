# maya — State
> Local, voice-capable Linux automation "body" (Bun/TS), mid-pivot to a CLI-first interface for coding agents. · Last checkpoint: 2026-07-06

## 🚧 In progress / next
- Active build: **CLI-canonical direction** (ADR 0002). Recent PRs #35–#47 added the declarative
  registry, envelope/capabilities, generic tool dispatcher, terminal/process commands, `serve`,
  `doctor`, and `find`.
- Not done yet: migrating remaining MCP-adapter safety/audit logic fully into `runTool` (parity gap
  acknowledged); curated `maya browser ...` commands; `maya docs query`, `maya files map`,
  `maya capabilities`, `maya setup` skill-installer (ADR 0004); `src/ipc/server.ts` is a TODO placeholder.
- Hard removal of MCP is deferred to a future issue — MCP is demoted, not deleted.

## Status
- **Working:** MCP stdio server exposing 30+ tools (browser/shell/process/file/sensing/vault/memory/
  reminders); legacy daemon + voice-agent path (`ask`/`live`/`start`); safety wrapper `runTool`
  (audit, payment gate, catastrophic-shell gate, undo, retention); declarative CLI with generic
  dispatcher (`tool list/describe/call`), `terminal run`, `proc *`, `serve`, `doctor`, `find`;
  docs-index JSON catalogs + validator.
- **Overlay:** separate Electron/React/Vite package under `overlay/` (animated-eyes UI).

## Architecture map
- CLI entry -> `src/index.ts`
- Declarative CLI registry -> `src/cli/` (`specs.ts`, `parser.ts`, `run.ts`, `help.ts`, `tool.ts`, `find.ts`, `doctor.ts`, `serve.ts`, `legacy.ts`)
- Enforced-execution wrapper (only sanctioned tool path) -> `src/core/run-tool.ts`
- Tool registry + tools -> `src/tools/index.ts`, `src/tools/{browser,shell,process,file,sensing,app,vault,memory,proactive,voice}.ts`
- MCP server (stdio) -> `src/mcp/server.ts` (`startMcpServer()`), setup `src/mcp/setup.ts`
- Legacy agent loop / brain -> `src/agent/`, `src/brain/{anthropic,gemini,ollama,ping}.ts`
- Legacy daemon -> `src/daemon/service.ts`
- Safety/audit -> `src/safety/{floor,catastrophic,audit,redact,retention}.ts`
- Config (Zod, `~/.config/maya/`) -> `src/config/index.ts`
- Voice -> `src/voice/{listen,tts,ports,turn}.ts`
- Overlay/IPC -> `src/overlay/`, `src/ipc/`, UI in `overlay/`
- Docs-index catalogs -> `docs-index/{files,tools,commands}.json`, validator `src/docs-index/validate.ts`

## Stack & run
- Stack: TypeScript (strict) on **Bun 1.3.3**, no build step for main app · Playwright, `@modelcontextprotocol/sdk`, `@anthropic-ai/sdk`, Zod · overlay = React+Vite+Electron
- Run: `bun src/index.ts --help` · MCP server: `bun src/index.ts serve` · Test: `bun test` · Typecheck: `bun run typecheck`
- See `docs/conventions.md` for the full command list and the "don't run tests locally" convention.

## Key decisions (top 3–5)
- CLI is canonical; MCP demoted but not deleted (ADR 0002).
- One shared `runTool()` is the only sanctioned execution path (audit/payment/catastrophic gates, undo) (ADR 0005).
- Declarative `COMMAND_SPECS` registry replaces Commander; dual-layer surface (generic `tool call` + curated commands) (ADR 0003).
- Agent discovery via a generated skill file, not MCP auto-injection (ADR 0004, not yet implemented).
- See `docs/decisions.md` + `docs/adr/` for the full record.

## Gotchas
- Linux-desktop-specific: sensing/screenshot need `grim`/`spectacle`/ImageMagick; window/clipboard need `hyprctl`/`kdotool`/`xdotool`/`wl-*`; voice needs Piper/`sox`/PulseAudio.
- Browser tools require `bunx playwright install chromium`.
- `.env` needs `ANTHROPIC_API_KEY` (optional `GEMINI_API_KEY`) for the legacy brain path.
- Runtime state lives under `MAYA_DIR` (default `~/.config/maya/`) — never commit it.
- `bun run start:overlay` is knowingly broken (no `start` script in `overlay/`).
- Discovery/read-only CLI commands must NOT init Playwright/TTS/reminders/process-manager/daemon — architectural constraint.
- Root `tsconfig.json` only covers `src/`.
