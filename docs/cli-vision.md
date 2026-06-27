# CLI vision

## Purpose

The Maya CLI is primarily an interface for coding agents. Its success metric is not interactive shell
ergonomics; it is how much repository scanning, schema loading, repeated discovery, and output parsing
an agent can avoid.

MCP remains the broad capability protocol. The CLI becomes the low-context path for known, bounded
operations.

## Existing CLI

Maya is not starting from zero. `src/index.ts` already uses Commander and exposes:

| Command | Purpose |
|---|---|
| `maya start` | Start the legacy daemon, optionally without overlay |
| `maya stop` | Stop the daemon |
| `maya status` | Report daemon status |
| `maya live` | Run one legacy brain command with live overlay state |
| `maya ping` | Verify the Anthropic key with a small request |
| `maya ask` | Run one legacy in-process agent request |
| `maya mcp` | Start the MCP stdio server |
| `maya setup` | Register Maya with Claude Code and/or Codex |

Planned work should extend this surface without breaking those commands.

## Design principles

1. **Agent-first output.** Default text is short, deterministic, and actionable. Add `--json` for
   stable machine parsing rather than making verbose JSON the only interface.
2. **Progressive discovery.** `--help` shows command groups; `tools list` shows names and one-line
   summaries; `tools describe` shows one full contract.
3. **Cheap read paths.** `find`, `docs query`, `tools list`, and `files map` read local indexes without
   starting Playwright, TTS, reminders, the daemon, or MCP.
4. **One implementation.** CLI and MCP adapters call shared execution logic. Neither adapter owns a
   second implementation of browser, terminal, file, or safety behavior.
5. **Bounded output.** Commands accept limits where results can grow and explicitly say when output is
   truncated.
6. **Explicit side effects.** Action commands identify what they will operate on and preserve current
   safety, audit, and confirmation behavior.
7. **Stable exit behavior.** Success, invalid usage, missing dependency, blocked action, and execution
   failure must produce distinct non-ambiguous outcomes.

## Highest-value command order

1. `maya --help`, `maya doctor`, and existing command cleanup.
2. `maya find`, `maya tools list`, `maya tools describe`, `maya docs query`, and `maya files map`.
3. `maya docs index` with deterministic validation/regeneration.
4. `maya serve` as a clear alias or successor for the MCP launch path.
5. Browser and terminal command groups after shared lifecycle, output, safety, and audit contracts are
   tested.

Discovery commands save tokens first and carry minimal behavioral risk. Browser and terminal actions
may save more per execution, but prematurely adding them could duplicate logic or bypass MCP safety.

## Planned command surface

```text
maya --help
maya doctor [--json]
maya serve
maya find <query> [--type file|tool|doc|command] [--limit N] [--json]
maya docs query <query> [--limit N] [--json]
maya docs index [--check]
maya tools list [--category category] [--json]
maya tools describe <tool-name> [--json]
maya files map [query] [--json]
maya browser screenshot --out <path>
maya terminal run <command...>
```

Exact naming and compatibility with `maya mcp` must be decided in the command architecture issue.

## Output sketch

```text
$ maya find screenshot
tool  browser_screenshot  src/tools/browser.ts       Capture current Playwright page
tool  screenshot          src/tools/sensing.ts       Capture current desktop
doc   screenshots         docs/architecture.md       Browser and desktop screenshot paths
3 results
```

Errors should name the failed condition and the next useful action:

```text
error: Playwright browser is unavailable
next: bunx playwright install chromium
```

Avoid prose introductions, decorative symbols, timestamps in deterministic index output, or full
schemas unless the agent explicitly requests a description or JSON.

## Deferred

- Full CLI implementation in this documentation cycle.
- Bulk extraction of a new core directory.
- Interactive TUI or shell completion.
- Remote index service, embeddings, or vector database.
- DNS/system commands that do not correspond to implemented Maya capabilities.
- Removal of MCP, `maya ask`, the daemon, or overlay paths.
