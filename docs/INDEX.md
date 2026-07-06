# Docs index — maya
> The map. Read STATE.md first; come here to find any other doc.

## Context system (start here)
| Doc | What it's for |
|-----|----------------|
| STATE.md | Current state — read this first on any fresh session |
| decisions.md | Append-only log of load-bearing choices + why (formal records in adr/) |
| conventions.md | Stack, run/test/build commands, workflow + naming conventions |
| old_context.md | Honest pre-tracking backstory (reconstructed at adoption 2026-07-06) |
| specs/ | Numbered specs for complex features (see /spec) |
| sessions/ | One append-only log per day |

## Existing project docs
| Doc | What it's for |
|-----|----------------|
| README.md | Index/entry point for agent docs; current CLI-first direction + command list |
| architecture.md | Runtime/dependency map, tool architecture, `runTool` wrapper, "do not refactor yet" list |
| cli-vision.md | CLI product vision, command surface, implemented-vs-planned table |
| mcp-server.md | MCP server entry point, startup/registration/call flow, why MCP is context-heavy |
| file-map.md | Table mapping source paths to responsibilities |
| tools-map.md | Full tool catalog by category with source file + CLI mapping |
| quick-find.md | How to query the docs-index catalogs; rules for `maya find` |
| glossary.md | Project terminology (body/brain, envelope, parity, agent-first CLI, …) |
| development.md | Install/run/test/build commands, env/config, contribution rules |
| agent-workflow.md | Navigation order for coding agents, CLI-vs-MCP guidance, change discipline |
| PRD-maya-cli-agent-interface.md | Full PRD for the CLI-canonical pivot (problem, user stories, decisions) |

## Decision records (authoritative)
| Doc | What it's for |
|-----|----------------|
| adr/0001-cli-complements-mcp.md | (superseded) CLI as low-context complement to MCP |
| adr/0002-cli-becomes-canonical-mcp-demoted.md | CLI becomes canonical; MCP demoted, not deleted |
| adr/0003-declarative-cli-architecture.md | Declarative COMMAND_SPECS registry replaces Commander |
| adr/0004-discovery-via-generated-skill.md | Agent discovery via a generated skill file |
| adr/0005-shared-enforced-execution-wrapper.md | `runTool()` as the only sanctioned execution path |

## Agent roles & automation
| Doc | What it's for |
|-----|----------------|
| agents/coder-prompt.md | Looped prompt for the autonomous "Coder" role (one issue via TDD + PRs) |
| agents/reviewer-prompt.md | Looped prompt for the autonomous "Reviewer" role (read-diff-and-comment) |
| agents/handshake-protocol.md | Coder⇄Reviewer PR-comment protocol + CI-only-testing rule |

## Machine-readable catalogs (outside docs/)
| Path | What it's for |
|-----|----------------|
| docs-index/{files,tools,commands}.json | Discovery catalogs powering `maya find` (validated by `src/docs-index/validate.ts`) |
| docs-index/index.md | Human-readable overview of the catalogs + interpretation rules |
