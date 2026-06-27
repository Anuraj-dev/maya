# Agent workflow

This workflow is optimized for coding agents that need a small amount of reliable context before
editing Maya.

## Navigation order

1. Read `docs/README.md` and the one topic document relevant to the task.
2. Search `docs-index/files.json`, `tools.json`, or `commands.json` for the task keyword.
3. Open only the mapped source file and its direct dependencies.
4. Confirm current behavior in source before changing it; `plan.md` and `plan-production.md` include
   future work that may not exist.
5. Do **not** run `bun test` or `bun run typecheck` locally — CI executes them on every PR push.
   Learn pass/fail via `gh pr checks <PR> --watch=false` and `gh run view <id> --log-failed`.
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

## Driving Maya: CLI vs MCP

The **CLI is the canonical interface** (ADR 0002). Use `maya <command>` for bounded lookups,
diagnostics, index operations, one-shot terminal actions, and any deterministic Maya action. MCP is
demoted to an optional pass-through; use it only when the host requires MCP protocol-level features
(rich image blocks, capability negotiation) that the CLI cannot yet provide.

The CLI should return the smallest complete result. Human explanation belongs in docs; command output
should favor stable names, paths, statuses, next commands, and explicit errors. Machine-readable
output uses `--json`; plain output stays concise and suitable for an agent transcript. Discovery is
bootstrapped via a generated skill installed by `maya setup` (ADR 0004), not MCP schema injection.

## Change discipline

- Keep discovery commands independent of browser, voice, reminder, and process startup.
- Route action commands through shared services and the existing safety/audit boundary.
- Avoid changing MCP behavior while adding CLI adapters.
- Add a test at the highest observable seam: CLI process output for command contracts, registry-level
  tests for indexes, and existing module tests for execution logic.
- Keep generated or indexed content deterministic so diffs are reviewable.

## Current cycle boundary

The foundation slices (#19–#23) establish docs alignment, the docs-index, the declarative CLI
registry, the shared `runTool` enforced-execution wrapper, and the CLI process-boundary test harness.
Action command slices (#24–#32) follow. Browser automation and terminal execution come last because
they depend on settled output, safety, and lifecycle contracts.
