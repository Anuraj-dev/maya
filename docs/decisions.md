# Decisions — maya
> Append-only log of load-bearing choices and WHY. Newest at the bottom.
> Format: `## YYYY-MM-DD — <decision>` then a short **Why:** line.
>
> Formal, authoritative decision records live in `docs/adr/`. The entries below marked
> `(inferred at adoption)` were reconstructed from code/docs on 2026-07-06 and are best-effort.

## 2026-07-06 — CLI is the canonical interface; MCP demoted but not deleted (inferred at adoption)
Why: see `docs/adr/0002-cli-becomes-canonical-mcp-demoted.md` (supersedes ADR 0001). MCP is context-heavy for agents; a CLI is lower-context.

## 2026-07-06 — One shared `runTool()` is the only sanctioned execution path (inferred at adoption)
Why: single place for audit, payment/catastrophic gates, and undo → safety parity across CLI and MCP. See `docs/adr/0005-shared-enforced-execution-wrapper.md`.

## 2026-07-06 — Declarative `COMMAND_SPECS` registry replaces Commander; dual-layer command surface (inferred at adoption)
Why: generic `tool call` dispatcher + curated `<group> <action>` commands from one spec source. See `docs/adr/0003-declarative-cli-architecture.md`.

## 2026-07-06 — Agent discovery via a generated skill file, not MCP auto-injection (inferred at adoption)
Why: avoid always-loaded context; let agents discover capabilities on demand. See `docs/adr/0004-discovery-via-generated-skill.md` (not yet implemented).

## 2026-07-06 — Bun runtime, no build step for the main app (inferred at adoption)
Why: run TS directly for fast iteration; only the separate `overlay/` Electron package has a Vite build.
