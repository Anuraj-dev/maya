<h1 align="center">Maya</h1>

<p align="center">
  A voice agent for Linux that listens, drives your browser and desktop, and reports back.<br />
  Say "Maya, ..." and she runs the task through gated, logged tools.
</p>

<p align="center">
  <a href="#installation">Install</a>
  ·
  <a href="#documentation">Docs</a>
</p>

Maya is a working prototype for a Linux desktop, built for Wayland and Hyprland. You talk to her through hyprvox, which writes each transcript to the clipboard. When a transcript starts with the wake word, Maya asks a brain to plan the task, then carries it out with tools: a Playwright browser, shell commands, files, apps, reminders, an Obsidian vault and persistent memory. She speaks her answers through Piper when Piper is installed, and when she is unsure she asks you out loud and listens for the reply.

The daemon runs on your machine. Maya has no account and no server. You bring an Anthropic API key for the default brain, or a free Gemini key for the demo brain, or run an Ollama model for an offline brain. The project is also building a command-line interface for coding agents. It already runs next to the voice daemon.

## What you get

- **Wake word, then a task.** Maya acts only on clipboard transcripts that start with the word set in `input.wakeWord`, which defaults to `maya`. Other transcripts are ignored, except the answer she is waiting for after she asks a question.
- **One path for every tool call.** Each call goes through `runTool()` in `src/core/run-tool.ts`. Payments and unrecoverable shell commands need `confirm: true`, and every call, allowed or blocked, is appended to `~/.config/maya/audit/log.jsonl`.
- **Undo for file changes.** Deleting a file moves it to `~/.config/maya/trash`. An overwrite snapshots the old contents first, and the `undo` tool restores the most recent one.
- **Confirmation before the irreversible.** The agent loop checks each call against the irreversible-action floor in `src/safety/floor.ts`. A file delete or overwrite, a sudo or package install, a payment and a sent message each wait for your yes or no.
- **A browser with a profile.** The browser tools drive Playwright Chromium with a persistent profile in `~/.config/maya/browser`. They navigate, read an ARIA snapshot, click, type, press keys, scroll, take screenshots and run page script. Headless mode is off by default.
- **Pick the brain per run.** `--provider` chooses the brain. `anthropic` uses Haiku 4.5 by default, and Sonnet 4.6 at low effort on the first turn of a request that looks like coding. `gemini` uses `gemini-2.0-flash`, and `ollama` uses `qwen2.5:3b` on a local server.
- **Commands an agent can call.** Every command takes `--json` and returns a versioned envelope. `maya capabilities --json` lists the full contract, `maya find` searches the curated docs index, and `maya setup claude` installs a discovery skill. `maya serve` runs an MCP stdio server for clients that want MCP.

## Installation

Maya runs from a clone. There are no releases yet.

| Dependency | Needed for |
| --- | --- |
| Dependency | Needed for |
| --- | --- |
| Bun 1.3.3 | Runtime. `package.json` pins `bun@1.3.3`. |
| Anthropic API key | The default brain and `bun src/index.ts ping`. |
| Playwright Chromium | Browser tools. Installed with `bunx playwright install chromium`. |
| hyprvox | Voice input and the wake word. |
| wl-paste | Clipboard watcher for voice transcripts. |
| piper, sox, paplay | Spoken replies. Piper synthesizes, sox adds the robot effect, and paplay plays it. |
| grim, spectacle or ImageMagick | Desktop screenshots. |
| GTK 3, GtkLayerShell, WebKit2 4.1, PyGObject | The overlay window that `maya start` launches. Skip it with `--no-overlay`. |

### Set up

```sh
git clone https://github.com/Anuraj-dev/maya.git
cd maya
bun install
bunx playwright install chromium
cp .env.example .env
```

Open `.env` and set `ANTHROPIC_API_KEY`. Add `GEMINI_API_KEY` if you want the free demo brain. Bun loads `.env` on its own, and `.env` is gitignored.

### Check the install

```sh
bun src/index.ts doctor
bun src/index.ts ping
```

`doctor` lists each required and optional dependency and the next step for anything missing. `ping` sends one small request to the default model to confirm the Anthropic key works.

### Run a task

```sh
bun src/index.ts ask "open example.com and tell me the heading"
bun src/index.ts ask --provider gemini "open example.com and tell me the heading"
```

`ask` runs one command through the in-process agent loop and prints the reply. The browser opens a window when the task needs one.

### Run the daemon

```sh
bun src/index.ts start
bun src/index.ts status
bun src/index.ts stop
```

`start` runs the daemon and launches the overlay. Pass `--no-overlay` to run without it. Voice input needs hyprvox on the same machine.

### Tests and typecheck

```sh
bun test
bun run typecheck
```

CI runs both on pull requests. Its typecheck step continues on error, so only the tests gate the build.

### Use it from a coding agent

```sh
bun src/index.ts setup claude
bun src/index.ts capabilities --json
bun src/index.ts find "browser screenshot"
```

`setup claude` writes a skill to `~/.claude/skills/maya/SKILL.md`. Use `setup codex` for `~/.codex/skills/maya/SKILL.md`, and add `--with-mcp` to register the MCP server as well.

## Configuration

Maya reads `$MAYA_DIR/config.json`, which defaults to `~/.config/maya/config.json`. A key in that file is a fallback when the matching environment variable is unset.

| Setting | Environment variable | Default | What it does |
| --- | --- | --- | --- |
| `brain.provider` | none | `anthropic` | Brain for the agent loop: `anthropic`, `gemini` or `ollama`. |
| `anthropicApiKey` | `ANTHROPIC_API_KEY` | none | Anthropic key. |
| `geminiApiKey` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | none | Gemini key. |
| `input.wakeWord` | none | `maya` | Word that starts a command. |
| `voice.piperVoice` | none | `en_US-amy-medium` | Piper voice, loaded from `~/.local/share/piper/voices/`. |
| `browser.headless` | none | `false` | Run the browser without a window. |
| `MAYA_DIR` | env only | `~/.config/maya` | Runtime state: config, audit log, memory, trash and browser profile. |

## How it works

1. hyprvox records your speech and writes the transcript to the clipboard. The clipboard watcher in `src/input/clipboard.ts` reads it with `wl-paste --watch`.
2. The agent loop in `src/agent/loop.ts` sends the task and the stored memory to the brain. On each step the brain proposes tool calls.
3. The floor check runs first. Each call then goes through `runTool()`, which applies the payment and catastrophic-shell gates and writes the audit entry.
4. Replies go through Piper, then sox, then paplay. The overlay receives state over a WebSocket bridge on `ws://localhost:4517`.

## Documentation

- [Development guide](docs/development.md): requirements, validation commands and package scripts.
- [Architecture](docs/architecture.md): runtime and dependency flow.
- [CLI direction](docs/cli-vision.md) and the [CLI PRD](docs/PRD-maya-cli-agent-interface.md).
- [MCP server](docs/mcp-server.md): registration and dispatch.
- [Architecture decisions](docs/adr/).
- [Original PRD](PRD.md).
- [AGENTS.md](AGENTS.md): the entry point for coding agents working in this repository.
