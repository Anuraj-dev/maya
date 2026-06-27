# Glossary

| Term | Meaning in Maya |
|---|---|
| Agent-first CLI | A command interface designed primarily for coding-agent context and parsing efficiency |
| Body | Maya's local sensing and action capabilities; an external coding agent can supply the reasoning |
| Brain | Either an external MCP client or the legacy in-process provider path in `src/brain/*` |
| Core | Reusable behavior shared by transport adapters; a target boundary, not yet a dedicated directory |
| Docs index | Curated JSON metadata that maps queries to files, tools, docs, and commands |
| MCP adapter | `src/mcp/server.ts`, which exposes tool specs and wraps execution with protocol, safety, and audit behavior |
| Tool registry | The `Record<string, MayaTool>` assembled by `buildTools()` plus MCP-local tools |
| Action command | A CLI command with machine or external side effects, such as browser or terminal execution |
| Discovery command | A local read-only CLI command such as `find`, `tools list`, or `docs query` |
| Agent-readable output | Bounded, deterministic output containing names, paths, status, errors, and next actions |
| Runtime-heavy dependency | Browser, TTS, reminder scheduler, process manager, daemon, or MCP lifecycle that lookup commands should avoid |
