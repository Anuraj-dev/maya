# Quick find

## Index files

| Index | Contains | Future consumer |
|---|---|---|
| `docs-index/files.json` | Important source and documentation paths | `maya find`, `maya files map` |
| `docs-index/tools.json` | MCP tools, sources, categories, future CLI mappings | `maya find`, `maya tools *` |
| `docs-index/commands.json` | Existing and planned CLI commands | `maya find`, `maya --help` support |
| `docs-index/index.md` | Human-readable index overview | agents and reviewers |

Catalog changes are checked through `src/docs-index/validate.ts`. All three catalogs share one
schema version, use unique names, reference existing repository paths, and stay sorted by name.

Each JSON file has `schemaVersion: 1`. Version the schema before making breaking field changes.

## Query now

```sh
rg -n -i 'browser' docs-index
rg -n -i 'terminal|shell|process' docs-index
rg -n -i 'screenshot' docs-index
rg -n -i 'config|environment' docs-index
```

To inspect JSON structurally without adding another dependency:

```sh
bun -e 'const x=await Bun.file("docs-index/tools.json").json(); console.log(x.tools.filter((v)=>v.keywords.includes("screenshot")))'
bun -e 'const x=await Bun.file("docs-index/files.json").json(); console.log(x.files.filter((v)=>v.category==="entrypoint"))'
bun -e 'const x=await Bun.file("docs-index/commands.json").json(); console.log(x.commands.filter((v)=>v.status==="planned"))'
```

## Search rules for `maya find`

`maya find` searches normalized lowercase values across `name`, `category`, `description`, `path`,
`mcpTool`, `futureCliCommand`, and `keywords`. Results identify their type, exact name, source
path, and one-line reason for use.

Recommended initial behavior:

- exact name match before prefix match, then keyword/description match;
- deterministic ordering;
- default result limit of 10;
- explicit count and truncation notice;
- `--type` filter for file, tool, doc, or command;
- `--json` with a versioned envelope for machine consumers;
- no embeddings, network calls, or source-tree crawl in the query path.

## Maintenance

Indexes are hand-maintained in this first cycle. A future `maya docs index` may derive parts of the
tool index from `ToolSpec`, but generated output must preserve curated fields such as usage guidance,
related docs, keywords, and future command mappings. `maya docs index --check` should fail when an
indexed path is missing, JSON is invalid, duplicate names exist, or a registered tool is absent.
