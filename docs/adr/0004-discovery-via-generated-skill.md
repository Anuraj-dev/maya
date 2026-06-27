# ADR 0004: Discovery bootstrap is a generated agent skill, not MCP auto-injection

- Status: accepted for planning
- Date: 2026-06-27
- Related: ADR 0002 (CLI is canonical), ADR 0003 (declarative registry)

## Context

MCP's hidden value is automatic discovery: once `maya setup` registers the MCP server, the host
agent auto-injects the tool catalog and the server `instructions` block every session. Removing
MCP (ADR 0002) removes that automatic injection. The brain must still learn that `maya` exists and
how to drive it — cheaply, or the token-efficiency goal is lost. A `CLAUDE.md`/`AGENTS.md` snippet
works but is *always* loaded, paying its cost even when Maya is never used that session.

## Decision

Discovery is a **generated agent skill**. `maya setup` installs/refreshes a `maya` skill into each
agent's skills directory (`~/.claude/skills/maya/` and `~/.codex/skills/maya/`). The skill's
`description` enumerates trigger scenarios (control the browser, take a screenshot, see the screen,
run a shell command, read/write files, reminders, vault search, …) so the host model
**auto-activates** it only when Maya is relevant. The `SKILL.md` body stays thin: a sentence or two
per command group, and a pointer to `maya capabilities` (full contract) and `maya tool describe`
(one schema). The skill body is **generated from the `COMMAND_SPECS` registry** so it cannot drift.

This yields a progressive-disclosure ladder: skill description (always-on, ~1 line) → SKILL.md body
(on trigger) → `maya capabilities` (on demand) → per-tool describe (one schema). Resting token cost
is lower than both MCP and an always-loaded memory snippet.

## Consequences

- `maya setup` stops registering an MCP server and instead manages the skill files idempotently.
- `maya doctor` gains a check: is the Maya skill installed in each configured agent's skills dir?
- Activation reliability depends on the skill `description`; it must list trigger scenarios broadly.
- Both Claude Code and Codex are first-class setup targets.
