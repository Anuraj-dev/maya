# Maya documentation

Maya is a Bun and TypeScript automation body for coding agents. It currently exposes browser,
terminal, file, desktop-sensing, voice, memory, reminder, and process capabilities through an MCP
stdio server. A small human-facing CLI already starts the daemon and MCP server.

The next product direction is **CLI-first agent usage**: keep MCP, but let coding agents invoke small,
focused commands without loading Maya's complete MCP tool catalog and JSON schemas into context.
The CLI is primarily a token-efficiency interface for agents, not a replacement for MCP or a general
interactive shell.

## Start here

| Need | Read |
|---|---|
| Understand the runtime and dependency flow | [architecture.md](architecture.md) |
| Work on Maya without scanning the repository | [agent-workflow.md](agent-workflow.md) |
| Understand MCP registration and dispatch | [mcp-server.md](mcp-server.md) |
| Understand the CLI product direction | [cli-vision.md](cli-vision.md) |
| Find an implemented tool | [tools-map.md](tools-map.md) |
| Find an important source file | [file-map.md](file-map.md) |
| Search docs and indexes efficiently | [quick-find.md](quick-find.md) |
| Install, test, and build Maya | [development.md](development.md) |
| Read the full product requirements | [PRD-maya-cli-agent-interface.md](PRD-maya-cli-agent-interface.md) |

Machine-readable discovery data lives in [`../docs-index`](../docs-index/index.md). Treat the source code as
the behavioral source of truth and update the indexes when a tool, command, or mapped file changes.

## Current boundary

This documentation cycle does not add the planned CLI commands, extract a core layer, or change MCP
behavior. Existing CLI commands remain `start`, `stop`, `status`, `live`, `ping`, `ask`, `serve`,
`mcp`, and `setup`.
