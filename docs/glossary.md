# Glossary

| Term | Meaning in Maya |
|---|---|
| Agent-first CLI | A command interface designed primarily for coding-agent context and parsing efficiency |
| Body | Maya's local sensing and action capabilities; an external coding agent can supply the reasoning |
| Brain | The external coding agent (Claude Code / Codex) that reasons and drives Maya by shelling out to `maya ...`; or the legacy in-process provider path in `src/brain/*` |
| Generic dispatcher | `maya tool call <name>` straight over `buildTools()`; the parity guarantee that makes every registered tool callable without per-tool CLI code |
| Curated command | A typed `maya <group> <action>` command with real flags, grown incrementally for high-traffic tools |
| Capabilities | The one-call `maya capabilities` contract listing every command; the low-context replacement for the MCP schema dump |
| Envelope | The deterministic `--json` result shape `{ok, version, command, data\|error}` |
| Parity | The state where the CLI can do everything the MCP server can, so MCP can be demoted (ADR 0002) |
| Core | Reusable behavior shared by transport adapters; a target boundary, not yet a dedicated directory |
| Docs index | Curated JSON metadata that maps queries to files, tools, docs, and commands |
| MCP adapter | `src/mcp/server.ts`, which exposes tool specs and wraps execution with protocol, safety, and audit behavior |
| Tool registry | The `Record<string, MayaTool>` assembled by `buildTools()` plus MCP-local tools |
| Action command | A CLI command with machine or external side effects, such as browser or terminal execution |
| Discovery command | A local read-only CLI command such as `find`, `tool list`, or `docs query` |
| Agent-readable output | Bounded, deterministic output containing names, paths, status, errors, and next actions |
| Runtime-heavy dependency | Browser, TTS, reminder scheduler, process manager, daemon, or MCP lifecycle that lookup commands should avoid |
