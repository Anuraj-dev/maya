# Old context — maya
> ⚠️ Reconstructed from the codebase, README, existing `docs/`, and git history when the context
> system was adopted on 2026-07-06. This is a best-effort summary of what the project is and how far
> it had progressed BEFORE per-session tracking began. It is NOT a record of exact past sessions or
> decisions — those weren't captured. Treat specifics as inferred, not authoritative.

## What this project is
Maya is a local, voice-capable automation agent — the "body" of a Jarvis-like assistant on Raja's
Linux desktop. Built in Bun/TypeScript, it exposes browser (Playwright), shell/process, file,
desktop-sensing, voice (Piper TTS), memory, reminder, and Obsidian-vault capabilities. It began as
an in-process voice assistant (wake word via `hyprvox`, an animated-eyes Electron overlay, a
Claude/Gemini/Ollama "brain") and is mid-pivot toward being a **CLI-first automation body driven by
external coding agents** (Claude Code / Codex), with MCP demoted from primary to secondary interface.

## How far it had progressed
By adoption, the following appeared built and working:
- Full initial implementation across "Phases 0–6" (voice, overlay, browser SPA tools, safety).
- An MCP stdio server exposing 30+ tools, plus `listen`/`speak`/`undo`.
- A legacy in-process agent path (`ask`/`live`/daemon) with pluggable brain providers.
- A production-hardening safety layer: tiered shell gate, audit redaction, retention GC, undo.
- A voice-turn state machine (endpointing, watchdog, barge-in).
- The **CLI-canonical pivot** was underway: a declarative command registry, envelope/capabilities
  layer, the shared `runTool()` wrapper, a generic tool dispatcher, terminal/process commands, and
  the `serve` / `doctor` / `find` commands (PRs #35–#47).

In-progress / not finished at adoption: full parity migration of MCP-adapter logic into `runTool`,
curated `maya browser ...` commands, several discovery commands (`docs query`, `files map`,
`capabilities`), the ADR-0004 skill installer, and `src/ipc/server.ts` (a placeholder).

## Notable structure / entry points
- CLI entry: `src/index.ts` (also `bin.maya`) → dispatches into `src/cli/`.
- MCP server entry: `src/mcp/server.ts` (`startMcpServer()`), launched by `bun src/index.ts serve`.
- Legacy daemon: `src/daemon/service.ts`; legacy one-shot agent: `src/agent/loop.ts`.
- Overlay app: `overlay/src/main.tsx` (React) + `overlay/electron/main.ts` (Electron main).
- Rich pre-existing docs under `docs/` (architecture, cli-vision, mcp-server, file-map, tools-map,
  glossary, PRD, and formal ADRs under `docs/adr/`) plus machine-readable catalogs in `docs-index/`.

## Inferred stack & tooling
TypeScript (strict) on Bun 1.3.3 with no build step for the main app; Playwright, MCP SDK, Anthropic
SDK, Zod. Tests via Bun's built-in runner (`bun:test`), typecheck via `tsc --noEmit`. CI on GitHub
Actions runs typecheck + `bun test` per PR. The `overlay/` subproject is a separate React+Vite+
Electron package. Convention (per `docs/agent-workflow.md`): contributors do NOT run tests locally —
CI does. Historical/older planning lives in top-level `PRD.md`, `plan.md`, `plan-production.md`.
