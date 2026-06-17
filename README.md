# Maya

> A female Jarvis-like voice agent. Speak. She listens, asks, acts (browser + desktop), and reports back — in a melodic, slightly-robotic voice, with animated eyes and a live task queue.

**Status:** scaffold (Phase 0). See [`PRD.md`](./PRD.md) and the build plan at
`~/.claude/plans/validated-popping-elephant.md`.

## What it is

You wake Maya by saying **"Maya, …"** (captured by [hyprvox](../hyprvox) → clipboard). She
reasons with Claude, executes through gated tools (a real browser via Playwright, plus
shell / files / apps), and talks back through Piper TTS. An Electron overlay shows her state
as animated eyes and a live queue of what she's doing. She asks when unsure — auto-opening the
mic for free-form answers and showing Approve/Deny for yes/no. She never modifies hyprvox.

## Architecture

```
hyprvox (unchanged) ── clipboard ──▶ Clipboard Watcher ──▶ Maya Daemon (Bun)
  ▲  maya runs `hyprvox start|stop`                         ├─ Agent loop (Anthropic tool-use)
  └──────────────────────────────────                       ├─ Auto-effort controller
                                                            ├─ Dedicated typed tools (gated)
                                                            ├─ Irreversible floor (code guard)
                                                            ├─ TTS (Piper → FX → paplay)
                                                            └─ IPC server ──▶ Electron overlay
                                                                              (eyes + task queue)
```

## Key decisions

- **Stack:** Bun + TypeScript daemon, Electron + React overlay (cloned from `hyprvox/overlay`).
- **Brain (budget mode):** `claude-haiku-4-5` drives every step + adaptive thinking; auto-effort
  per step (capped at `medium`); `claude-sonnet-4-6` is the dormant escalation. Never Opus.
- **Voice:** Piper female voice + a tunable subtle-synth FX (`robotIntensity` knob).
- **Safety:** Maya self-judges, but an in-code floor always confirms irreversible actions
  (delete/overwrite, sudo/install, payment, send/publish). "Maya, stop" / Esc aborts.
- **Memory:** session + persistent local store + Obsidian vault via the `ob` CLI.

## Layout

```
src/
  index.ts              CLI: maya start|stop|status|ask
  daemon/service.ts     orchestrator (Phase 4-5)
  agent/loop.ts         tool-use loop (Phase 1)
  agent/effort.ts       auto-effort controller        [implemented]
  agent/system-prompt.ts persona + boundary prompt     [implemented]
  tools/                browser, shell, file, app, vault, voice
  safety/floor.ts       irreversible-action guard      [implemented]
  voice/tts.ts          Piper + FX pipeline (Phase 3)
  input/clipboard.ts    wake-word + AWAITING parser    [parser implemented]
  ipc/{server,types}.ts daemon↔overlay contract
  config/index.ts       ~/.config/maya/config.json     [implemented]
overlay/                Electron app (Phase 5)
```

## Build phases

0. Setup · 1. Headless brain (terminal → browser) · 2. Boundaries · 3. Voice out ·
4. Voice in (hyprvox auto-listen) · 5. UI (eyes + task queue) · 6. Memory + polish.

## Brain providers (swappable)

Maya's brain is provider-neutral. Pick with `--provider` (or `brain.provider` in config):

| Provider | Use | Cost | Notes |
|---|---|---|---|
| `anthropic` | **intended brain** (Claude, Haiku in budget mode) | API metered (pennies/task) | auto-effort + adaptive thinking; `ANTHROPIC_API_KEY` |
| `gemini` | **free demo** | **free tier** | Google AI Studio key; runs on Google's servers (fast) |
| `ollama` | offline | free | needs `ollama serve` + a tool-capable model; slow on CPU |

## Develop

```bash
bun install
bunx playwright install chromium

# 1. Paste your key into .env  (cp .env.example .env, then fill ANTHROPIC_API_KEY=)
cp .env.example .env

# 2. Cheap smoke test — one tiny Haiku call to confirm the key works (fractions of a cent)
bun src/index.ts ping

# 3. Intended brain (Claude, Haiku in budget mode) — Bun auto-loads .env
bun src/index.ts ask "open github.com and list my open PRs"

# FREE alternative with Gemini — get a key at https://aistudio.google.com/apikey
bun src/index.ts ask --provider gemini "open example.com and tell me the heading"

# Run tests / typecheck
bun test
bun run typecheck
```

A visible Chromium window pops up and Maya drives it; her reply prints to the terminal.
