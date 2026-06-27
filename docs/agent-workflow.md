# Agent workflow

This workflow is optimized for coding agents that need a small amount of reliable context before
editing Maya.

## Navigation order

1. Read `docs/README.md` and the one topic document relevant to the task.
2. Search `docs-index/files.json`, `tools.json`, or `commands.json` for the task keyword.
3. Open only the mapped source file and its direct dependencies.
4. Confirm current behavior in source before changing it; `plan.md` and `plan-production.md` include
   future work that may not exist.
5. Run the narrow test file first, then `bun test` and `bun run typecheck` when the change warrants it.
6. Update the relevant docs-index entry if a mapped tool, command, or file changed.

## Low-context lookup examples

Until `maya find` exists, use `rg` against the index:

```sh
rg -n -i 'screenshot' docs-index docs
rg -n 'browser_screenshot' src/tools docs-index/tools.json
rg -n 'src/mcp/server.ts' docs docs-index
```

Do not run `tree .` without excluding `node_modules`; the root and overlay both contain dependency
trees. Prefer:

```sh
rg --files -g '!node_modules/**' -g '!overlay/node_modules/**'
```

## Choosing MCP or CLI later

Use the future CLI when the task is a bounded lookup, diagnostic, index operation, one-shot terminal
action, or deterministic Maya action. Use MCP when the agent needs tool discovery negotiated through
MCP, rich image blocks, or a long conversational sequence of multiple Maya capabilities.

The CLI should return the smallest complete result. Human explanation belongs in docs, while command
output should favor stable names, paths, statuses, next commands, and explicit errors. Planned
machine-readable output should use `--json`; normal output should remain concise text suitable for an
agent transcript.

## Change discipline

- Keep discovery commands independent of browser, voice, reminder, and process startup.
- Route action commands through shared services and the existing safety/audit boundary.
- Avoid changing MCP behavior while adding CLI adapters.
- Add a test at the highest observable seam: CLI process output for command contracts, registry-level
  tests for indexes, and existing module tests for execution logic.
- Keep generated or indexed content deterministic so diffs are reviewable.

## Current cycle boundary

This cycle creates navigation material only. The next coder cycle should validate the docs-index
schema and design the command adapter. It should not start with browser automation or terminal
execution, because those depend on settled output, safety, and lifecycle contracts.
