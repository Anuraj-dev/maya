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

## 2026-07-06 — Agent discovery skill is the default path; MCP is opt-in fallback (ADR 0004 implemented)
**Why:** MCP-registered servers auto-load all 30+ tool schemas + persona instructions into every agent session, paying the context cost even when Maya is never used. A generated `maya` skill (thin 1-line description that only auto-activates when relevant, body generated from the command registry so it can't drift) gives CLI-native agents a near-zero-cost discovery path. `maya setup` now installs the skill by default and only registers MCP behind `--with-mcp`. Alternative rejected: keep auto-registering MCP (too heavy) / strip MCP entirely (breaks MCP-only agents — so it was refactored 213→114 lines but kept fully functional).

## 2026-07-30 — Reconcile ADR-0004 and MCP execution status
**Why:** The 2026-07-06 adoption snapshot still contains a stale “not yet implemented” note, while commit `3738296` implements the generated skill and `src/mcp/server.ts` routes tool calls through `runTool`. Future work is curated CLI coverage and IPC/state completion, not a duplicate MCP safety migration.

## 2026-08-12 — Curated browser CLI uses a dedicated same-user worker
**Why:** A Playwright context owned by a one-shot CLI process either closes after each action and loses page state or keeps the command from exiting. A mode-0600 Unix socket under `MAYA_DIR` gives browser commands one persistent context while retaining `runTool` safety/audit enforcement and an idle shutdown. Alternative rejected: route browser actions through the voice daemon, which would couple CLI availability to unrelated voice/overlay lifecycle work.
