# Conventions — maya
- Stack: TypeScript (strict) on **Bun 1.3.3** — main app runs directly, no build/transpile step.
  Key libs: Playwright, `@modelcontextprotocol/sdk`, `@anthropic-ai/sdk`, Zod. Overlay = React + Vite + Electron (`overlay/`).

## Run / test / build
- Install: `bun install` · then `cp .env.example .env`
- Run CLI: `bun src/index.ts --help` · smoke test: `bun src/index.ts ping`
- Start MCP stdio server (canonical): `bun src/index.ts serve` (`maya mcp` is a compat alias)
- Legacy daemon: `bun run start` (= `bun src/index.ts start`) · watch: `bun run dev`
- One-shot legacy agent: `bun src/index.ts ask "..."`
- Tests: `bun test` (Bun's runner; colocated `*.test.ts`)
- Typecheck: `bun run typecheck` (= `tsc --noEmit`, covers `src/` only)
- Overlay build: `bun run build:overlay` · `bun run start:overlay` is **currently broken** (no `start` script in `overlay/`)
- Browser tools need: `bunx playwright install chromium`

## Workflow conventions
- **Do NOT run `bun test` / `bun run typecheck` locally** — CI (`.github/workflows/ci.yml`) runs them
  per PR to save local RAM. Check via `gh pr checks <PR> --watch=false` and `gh run view <id> --log-failed`.
  (See `docs/agent-workflow.md` and `docs/agents/handshake-protocol.md`.)
- No lint/format script exists in `package.json`.
- Coder⇄Reviewer agents coordinate over GitHub PR comments via the handshake protocol.

## Naming / structure notes
- Every sanctioned tool call goes through `src/core/run-tool.ts` (`runTool`) — audit, payment gate,
  catastrophic-shell gate, undo. Do not bypass it.
- Discovery / read-only CLI commands must NOT initialize Playwright, TTS, reminders, the process
  manager, or the daemon (architectural constraint — keep them cheap).
- Runtime state lives under `MAYA_DIR` (default `~/.config/maya/`): config.json, browser profile,
  audit logs, reminders, process metadata/logs, screenshots, memory. Never commit it. `.env`/`.env.local` are gitignored.
- Env: `ANTHROPIC_API_KEY` (required for legacy brain path); optional `GEMINI_API_KEY`/`GOOGLE_API_KEY`.
- Platform: Linux desktop (Wayland/Hyprland/KDE); sensing/voice depend on system tools
  (`grim`/`spectacle`/ImageMagick, `hyprctl`/`kdotool`/`xdotool`/`wl-*`, Piper/`sox`/PulseAudio).
