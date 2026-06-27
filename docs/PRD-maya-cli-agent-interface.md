# PRD: Maya CLI-first agent interface and docs/index system

- Status: planning complete; implementation not started
- Date: 2026-06-27
- Primary audience: coding agents and maintainers of Maya

## 1. Product summary

Maya is a local automation body that lets coding agents sense and act through browser, terminal, file,
desktop, voice, memory, reminder, process, and note capabilities. Maya will retain its MCP server and
add a CLI-first agent interface for focused discovery and execution.

The CLI's primary product value is token efficiency. A coding agent that knows its intent should be
able to issue one narrow terminal command and receive a bounded result instead of loading Maya's full
MCP tool catalog, descriptions, and JSON schemas into context.

## 2. Problem statement

MCP is effective for broad capability discovery and open-ended tool use, but Maya exposes more than
thirty tools. Loading the full catalog is unnecessary context overhead when an agent only needs to
find a file, inspect one tool, query one document, diagnose Maya, capture one browser screenshot, or
run one command.

The repository also mixes current behavior with future plans across source files and older planning
documents. Agents can waste tokens scanning both root and overlay dependency trees, repeatedly tracing
the same tool registration flow, or treating roadmap entries as implemented features.

## 3. Why MCP-only usage is inefficient for future agents

- MCP discovery presents all tool names, descriptions, and input schemas even for a single known task.
- Broad tool context competes with the code and product context needed for the actual change.
- Agents repeatedly rediscover where browser, screenshot, terminal, config, and safety behavior live.
- Rich tool descriptions are useful during discovery but redundant after the desired operation is known.
- MCP transport is less convenient than a process command for deterministic repo-local lookups and CI.

MCP remains valuable for capability negotiation, conversational multi-tool sequences, and rich content
such as image blocks. The problem is MCP-only access, not MCP itself.

## 4. Why CLI reduces context and token usage

A command path encodes intent before execution. `maya tools describe browser_screenshot` requests one
contract; `maya find screenshot` requests a bounded cross-index lookup; `maya doctor` requests a known
diagnostic. The agent receives only the relevant output and can defer reading source until needed.

The CLI also creates a stable interface for scripts and tests. Deterministic text plus an explicit JSON
mode lets agents parse results without carrying explanatory prose or unrelated schemas.

## 5. Goals

1. Preserve Maya's MCP server while adding a lower-context interface for known operations.
2. Make repository and capability discovery possible without scanning the source tree.
3. Reduce repeated context usage in planner, coder, and reviewer agent workflows.
4. Provide concise, bounded, deterministic output with a versioned machine-readable option.
5. Reuse one implementation across MCP and CLI action adapters.
6. Preserve safety, auditing, undo, lifecycle, and error semantics for side-effecting commands.
7. Keep documentation and indexes specific, local, reviewable, and cheap to query.
8. Ship discovery and diagnostics before high-risk action command groups.

## 6. Non-goals

- Replacing or removing MCP.
- Building the full CLI in the initial documentation cycle.
- Creating a general-purpose interactive shell or TUI.
- Duplicating browser, terminal, file, reminder, process, or safety logic.
- Performing a broad core-layer refactor before concrete CLI adapters require it.
- Adding DNS, system-state, audio, media, or desktop-control capabilities that Maya does not implement.
- Using embeddings, a vector database, a remote index service, or an LLM in the basic query path.
- Rewriting the legacy brain, daemon, voice, or overlay systems as part of CLI discovery work.

## 7. User personas

### Coding agent using CLI

Needs fast, low-context discovery and deterministic one-shot actions. It values exact names, paths,
status, exit codes, limits, and next steps over conversational explanation.

### Coding agent using MCP

Needs negotiated capabilities, conversational sequencing, or rich MCP content. It expects current tool
contracts and behavior to remain compatible as CLI support is added.

### Human developer debugging Maya

Needs `--help`, diagnostics, clear dependency/config errors, and direct commands that reproduce agent
behavior without attaching an MCP client.

### Future planner, reviewer, and coder agents

Need a shared vocabulary and fast map of current architecture, planned work, source locations, test
seams, issue readiness, and deferred scope.

## 8. Current system summary

Maya is a Bun/TypeScript package with a Commander CLI. Existing commands start/stop/status the daemon,
run legacy agent paths, ping an LLM provider, launch the MCP stdio server, and register MCP clients.

The standard tool registry combines provider-neutral specs and execution functions from category
modules. The MCP adapter adds voice-loop and undo tools, exposes the catalog, dispatches calls, applies
payment and catastrophic-shell policy, writes audit records, and converts returned image paths into
MCP image blocks.

Browser control uses a persistent Playwright profile. Desktop sensing has a separate screenshot path.
One-shot shell and managed background process behavior are separate. Configuration is Zod-validated
and runtime state defaults to a per-user Maya directory. Existing tests cover several pure logic and
service seams, but not CLI process contracts, MCP protocol behavior, browser actions, or index validity.

## 9. Proposed architecture

```text
                         +-------------------+
coding agent ----------> | CLI adapter       |
                         | help/find/doctor  |
                         | focused actions   |
                         +---------+---------+
                                   |
                                   v
curated docs/index ---> discovery services   shared action services
                                   ^                    ^
                                   |                    |
                         +---------+---------+          |
MCP client ------------> | MCP adapter       +----------+
                         | list/call/images  |
                         +-------------------+
```

Discovery services must remain lightweight and local. Action services must contain or invoke the same
behavior used by MCP. Transport adapters own formatting/protocol concerns but not duplicated business
logic. Safety and audit policy must become reusable where the current MCP adapter owns it exclusively.

Extraction should be incremental: first adapt existing tool registry/executors; extract a dedicated
service only when action command tests demonstrate a real coupling problem.

## 10. CLI design principles

- **Agent-first:** optimize for small context, direct invocation, and predictable parsing.
- **Progressive disclosure:** help, list, and describe reveal increasing detail.
- **Text by default:** concise tabular/line output for transcripts; `--json` for stable automation.
- **Bounded results:** default limits and explicit truncation/count information.
- **Cheap discovery:** no browser, TTS, daemon, reminder, process manager, or MCP startup for indexes.
- **Clear errors:** state the condition, relevant path/dependency, and next action.
- **Stable behavior:** distinguish invalid usage, unavailable dependencies, policy blocks, and failures.
- **No hidden duplication:** action commands call shared services and policies.
- **Compatibility:** preserve current commands and MCP names unless a separate migration is approved.

## 11. Planned CLI commands

### Foundation and diagnostics

- `maya --help`
- `maya doctor [--json]`
- `maya serve` while retaining compatibility with `maya mcp`

### Discovery

- `maya find <query> [--type file|tool|doc|command] [--limit N] [--json]`
- `maya docs query <query> [--limit N] [--json]`
- `maya docs index [--check]`
- `maya tools list [--category category] [--json]`
- `maya tools describe <toolName> [--json]`
- `maya files map [query] [--json]`

### Focused action groups

- `maya browser screenshot --out <path>`
- `maya terminal run <command...>`

Broader browser and terminal commands may follow after lifecycle and policy reuse are proven. The
planned command catalog must never imply that unimplemented commands are available.

## 12. Docs system design

The docs system provides a short hub, current architecture, agent workflow, MCP lifecycle, CLI vision,
tool map, file map, quick-find rules, development instructions, a glossary, and decision records.

Docs must identify current behavior, future behavior, and known absence separately. Source remains the
behavioral authority. Topic documents should link to indexes and avoid copying full implementation
details that are likely to drift.

## 13. Quick-find/index design

The first index is local JSON with a schema version. Separate catalogs cover important files,
implemented tools, and implemented/planned commands. Curated entries include names, categories,
descriptions, paths, related docs, MCP mappings, future CLI mappings, keywords, and when-to-use text.

Initial query behavior should normalize case, prefer exact names, then prefixes, then keywords and
descriptions. Results are deterministic and bounded. A later index command validates JSON, duplicate
names, missing paths, registered-tool coverage, and deterministic output.

Generation should not erase curated guidance. Tool metadata may eventually be derived from the
registry while human-curated fields remain in a companion source or merge layer.

## 14. Agent workflow design

1. Read the docs hub and one relevant topic page.
2. Query the local index before searching source.
3. Open the mapped file and direct dependencies only.
4. Verify behavior in source, especially where older plans describe future work.
5. Run the narrowest relevant test, then broader validation.
6. Update docs/index metadata when a mapped contract changes.

Planner agents use docs and the PRD. Coder agents use exact file/tool mappings and acceptance criteria.
Reviewer agents use command contracts, index validation, and MCP compatibility tests.

## 15. Core/MCP/CLI separation strategy

The desired separation has three layers:

- **Core/services:** tool execution, browser lifecycle, shell/process behavior, file operations,
  reminders, configuration, and reusable safety/audit policy.
- **MCP adapter:** protocol schemas, list/call handlers, rich content conversion, and MCP lifecycle.
- **CLI adapter:** argument parsing, process exit behavior, concise text/JSON formatting, and command
  lifecycle.

The current standard tool objects already combine metadata with executors and are the initial reuse
point. Do not create a broad new core directory first. Extract only adapter-exclusive concerns needed
for one vertical command slice, preserving tests and MCP behavior on each step.

## 16. Testing strategy

Good tests assert external behavior rather than internal directory shape.

- Spawn the CLI and assert exit code, stdout, and stderr for help, invalid usage, empty matches,
  bounded matches, JSON mode, missing dependencies, policy blocks, and action failures.
- Validate index JSON schema/version, unique names, referenced paths, deterministic ordering, and tool
  coverage against the registered tool catalog.
- Keep query ranking tests table-driven and deterministic.
- Test MCP compatibility at the list/call adapter seam when shared action behavior is extracted.
- Reuse existing module/service tests for shell classification, audit/undo, reminders, processes, and
  browser-independent logic.
- Keep real browser, desktop, voice, and system dependencies behind a short manual smoke checklist or
  thin integration tests with controlled environments.

The highest initial seam is the CLI process boundary because output and exit behavior are the product
contract. The highest index seam is complete validation of checked-in artifacts. Action-command tests
must also assert that shared safety/audit behavior is not bypassed.

## 17. Migration strategy

1. Land specific docs, glossary, ADR, and versioned indexes without runtime changes.
2. Add index validation and CLI process-test infrastructure.
3. Design command modules, output envelopes, exit codes, and current-command compatibility.
4. Implement help/doctor and read-only discovery commands.
5. Add deterministic index regeneration/check behavior.
6. Add/alias the MCP serve command without removing `maya mcp`.
7. Extract only the policy/lifecycle seam required for one browser screenshot vertical slice.
8. Add the terminal vertical slice only after safety/audit parity is demonstrated.
9. Expand action groups incrementally, measuring output size and agent usefulness.

## 18. Risks

- Index drift could misdirect agents; validation and source verification are required.
- A CLI action could bypass MCP-only safety or auditing if execution is called at the wrong seam.
- A broad core refactor could destabilize working MCP behavior before delivering token savings.
- Command output could become verbose and recreate the context problem in another form.
- JSON contracts could be treated as stable before versioning is defined.
- Persistent browser and managed-process lifecycles differ between a long-running MCP server and a
  one-shot CLI process.
- Existing CLI and remote default-branch conventions may create compatibility/workflow confusion.
- Roadmap documents can be mistaken for implemented capabilities.

## 19. Milestones

1. **Documentation foundation:** repo audit, current architecture, workflow, MCP, maps, glossary, ADR.
2. **Index foundation:** versioned files/tools/commands catalogs and validation contract.
3. **CLI architecture:** command modules, output/JSON envelope, exit codes, compatibility decisions.
4. **Discovery CLI:** help, doctor, find, tools, docs, and files commands.
5. **MCP serving compatibility:** `serve` design and regression tests.
6. **First shared action:** browser screenshot through a reusable lifecycle/policy seam.
7. **Terminal action:** shared shell behavior with safety/audit parity.
8. **Measured expansion:** additional action commands only when they demonstrate agent token value.

## 20. Acceptance criteria

- A future agent can locate browser, screenshot, terminal, config, MCP, and safety code from docs/index
  without scanning the repository.
- Current and planned commands are clearly distinguishable.
- The reason for CLI-first design explicitly centers coding agents and token efficiency.
- MCP remains supported and unchanged by the documentation cycle.
- Discovery command design has bounded text output and a planned versioned JSON mode.
- The index includes all currently registered standard/MCP-local tools and records dependency-gated
  `voice_ask` accurately.
- DNS and system-state roadmap items are not represented as implemented tools.
- Future action commands are required to reuse execution, safety, and audit behavior.
- CLI process-contract and docs-index validation seams are defined before implementation.
- Issues are small, dependency-aware, estimated, and only the next three or four are ready.

## 21. Suggested issue breakdown

1. **Docs: repo audit and architecture map** (S, ready) - current runtime, tools, files, config, tests.
2. **Docs: agent workflow and MCP overview** (S, ready) - low-context navigation and MCP lifecycle.
3. **Docs-index: first files/tools/commands index** (M, ready) - versioned curated catalogs.
4. **PRD: Maya CLI-first agent interface** (M, ready) - product/architecture/test/migration contract.
5. **CLI: command architecture design** (M, blocked on 1-4) - modules, compatibility, output, JSON, exits.
6. **CLI: foundation and help command** (M, blocked on 5).
7. **CLI: doctor command** (M, blocked on 6).
8. **CLI: find command using docs-index** (M, blocked on 3, 5, 6).
9. **CLI: tools list/describe commands** (M, blocked on 3, 5, 6).
10. **CLI: docs query/index commands** (M, blocked on 3, 5, 6).
11. **CLI: serve command for MCP server** (S, blocked on 5, 6).
12. **CLI: browser command group** (L, future; starts with screenshot vertical slice).
13. **CLI: terminal command group** (L, future; requires safety/audit parity).
14. **Refactor: extract reusable core layer where needed** (L, future; incremental only).
15. **Tests: CLI and docs-index validation** (M, blocked on 3 and paired with milestones 3-7).

## Implementation decisions

- Extend the existing Commander CLI rather than introduce a second parser.
- Keep MCP and CLI as peer adapters over shared behavior.
- Implement read-only discovery before side-effecting commands.
- Keep versioned local JSON indexes as the first query source.
- Provide concise deterministic text and a planned explicit JSON mode.
- Preserve existing command names while separately deciding whether `serve` aliases `mcp`.
- Extract shared policy/services incrementally from demonstrated adapter needs.
- Do not initialize runtime-heavy dependencies for discovery commands.

## Testing decisions

- Treat spawned CLI behavior as the primary command contract.
- Treat checked-in index validation as the primary docs-index contract.
- Test query/ranking deterministically without network or LLM calls.
- Add MCP regression coverage when shared action seams change.
- Reuse existing pure/service tests and keep environment-dependent smoke tests thin.

## Out of scope

The full CLI, broad refactoring, new DNS/system capabilities, MCP removal, a TUI, remote search,
embeddings, and legacy voice/daemon/overlay rewrites are outside this planning cycle.

## Further notes

The docs/index artifacts are intended to become inputs to the CLI, not a parallel documentation
project. Their value should be measured by reduced file scans, smaller agent context, fewer repeated
tool-schema loads, and faster task orientation. Future implementation issues should remain vertical,
small, and independently reviewable.
