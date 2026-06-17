# Maya — PRD

> A female Jarvis-like voice agent: listens, asks, executes (browser + desktop), and reports back in a melodic, slightly-robotic voice — with animated eyes and a live task queue.

Status: **Phases 0–4 built** (setup → headless brain → boundaries → voice out → voice in).
`maya start` runs the always-on daemon: clipboard wake-word, agent loop, spoken replies,
hands-free follow-ups (voice_ask → hyprvox), and the live overlay oval. Remaining: Phase 6
(persistent memory + vault + Opus escalation) and overlay polish.
Build plan: `~/.claude/plans/validated-popping-elephant.md`.
Companion tool (unmodified): hyprvox at `~/Anuraj-Dev/hyprvox`.

---

## Problem Statement

Raja drives his machine through a voice-to-text tool (hyprvox) that only *types for him* —
it drops a transcript on the clipboard and stops there. He still has to do every action
himself: open the browser, click through pages, fill forms, run commands, read results. He
wants to *talk to his computer and have it act* — "open my GitHub and check my PRs", "find
the top 3 trending Python repos" — and talk back to him like an assistant, not a text box.
Today there is no agent that (a) takes a spoken command, (b) executes it across the browser
and desktop, (c) asks him when it's unsure, and (d) reports back by voice, with a presence
on screen he can watch.

## Solution

**Maya** — an always-on agent that turns Raja's voice into action. He wakes her by speaking
"Maya, …" (captured via hyprvox → clipboard). Maya reasons with Claude, executes through a
set of gated tools (a real browser via Playwright, plus shell/files/apps), and narrates back
through a melodic, slightly-robotic female voice. An on-screen overlay shows animated **eyes**
that emote across her states (idle → listening → thinking → acting → speaking → awaiting) and
a **live task queue** of exactly what she's doing. When she needs something from Raja — a
clarification or a confirmation before an irreversible action — she asks: she auto-opens the
mic (driving hyprvox for him) for free-form answers, and shows Approve/Deny buttons for yes/no.
She remembers within a session, across days, and can read/write Raja's Obsidian vault.

## User Stories

1. As Raja, I want to wake Maya by saying "Maya, …", so that I can start a command hands-free without touching the keyboard.
2. As Raja, I want Maya to only act on transcripts that start with the wake word, so that my normal hyprvox dictation into other apps is never hijacked.
3. As Raja, I want Maya to open a website and read its content aloud, so that I can get information without looking or typing.
4. As Raja, I want Maya to click buttons and links on a page, so that she can navigate flows for me.
5. As Raja, I want Maya to fill in and submit forms, so that she can complete tasks like searches and logins.
6. As Raja, I want Maya to reuse a browser profile I've logged into once, so that "open my GitHub PRs" just works without re-authenticating every time.
7. As Raja, I want Maya's browser to be a separate, dedicated profile, so that a mistake can't touch my everyday browsing or accounts.
8. As Raja, I want Maya's browser window visible, so that I can watch what she does and take over if needed.
9. As Raja, I want Maya to run shell commands when a task needs it, so that she can act beyond the browser.
10. As Raja, I want Maya to open desktop apps on request, so that she can set up my environment by voice.
11. As Raja, I want Maya to read and write my Obsidian vault, so that she can answer "what's on my MAD2 list?" and "note this down".
12. As Raja, I want Maya to judge for herself whether an action is risky, so that the experience stays fluid and she only interrupts when it matters.
13. As Raja, I want a hard, non-bypassable confirmation before truly irreversible actions (deleting/overwriting files, sudo/installs, payments, sending/posting/publishing), so that a misjudgment or a malicious webpage can't cause unrecoverable harm.
14. As Raja, I want Maya to ask me before crossing that line even if she "thinks" it's fine, so that I always have the final say on irreversible things.
15. As Raja, I want to abort Maya instantly by saying "Maya, stop" or pressing Esc, so that I can halt anything in progress.
16. As Raja, I want Maya to ask clarifying questions mid-task, so that she does the right thing instead of guessing.
17. As Raja, when Maya asks an open-ended question, I want the mic to auto-open and auto-stop when I finish speaking, so that I can answer without pressing the hyprvox key each turn.
18. As Raja, I want yes/no confirmations to also appear as Approve/Deny buttons in the overlay, so that I can confirm with a click when that's faster than speaking.
19. As Raja, I want Maya to reply in a melodic, human, slightly-robotic female voice, so that she feels like a real assistant with a distinct identity.
20. As Raja, I want to tune how "robotic" her voice sounds, so that I can dial in the character I like.
21. As Raja, I want her to start speaking as soon as the first sentence is ready, so that responses feel snappy rather than delayed.
22. As Raja, I want animated eyes on screen that change with her state, so that I can tell at a glance whether she's listening, thinking, acting, or speaking.
23. As Raja, I want a live task queue showing each step she takes and its status, so that I always know what she's doing and whether a step failed.
24. As Raja, I want the overlay to float on top, positioned consistently on my Hyprland desktop, so that it's always visible without managing a window.
25. As Raja, I want Maya to remember context within a session ("do that again", "open the first one"), so that follow-ups feel natural.
26. As Raja, after Maya finishes, I want a short follow-up window where I can speak again without the wake word, so that multi-turn exchanges flow.
27. As Raja, I want Maya to remember things across days, so that she can recall what I asked her before.
28. As Raja, I want Maya to be snappy on simple actions but think hard on complex ones, so that I get both speed and good judgment.
29. As Raja, I want Maya to escalate to a stronger model only for genuinely hard planning, so that I'm not paying for or waiting on heavy reasoning when it isn't needed.
30. As Raja, I want Maya to never modify hyprvox, so that my friend's tool keeps working untouched.
31. As Raja, I want Maya to run as a background service I can start/stop/status, so that she's available whenever I want her.
32. As Raja, I want Maya to tell me clearly when she can't do something or a step failed, so that I'm never misled about what happened.
33. As Raja, I want Maya to summarize what she did after a multi-step task, so that I get the outcome without watching every step.
34. As Raja, I want Maya to recover gracefully if hyprvox's auto-stop misfires, so that a flaky mic doesn't trap me — she falls back to a simple follow-up window.
35. As Raja, I want secrets (API keys) kept in config out of the system prompt and logs, so that they aren't leaked.

## Implementation Decisions

- **Two-process architecture mirroring hyprvox.** A **Maya daemon** (Bun + strict TypeScript)
  owns the agent loop, tool executors, TTS pipeline, clipboard watcher, hyprvox control, and
  an **IPC server** (Unix domain socket, newline-delimited JSON, versioned `hello`/`state`
  broadcast, stale-socket cleanup). A separate **Electron + React overlay** is a thin reactive
  renderer that subscribes to the daemon's broadcast and draws the eyes, task queue, and
  Approve/Deny controls. Config/socket/PID live under `~/.config/maya/`. hyprvox is never
  modified.
- **State machine** broadcast to the overlay and used to drive the eyes:
  `idle → listening → thinking → acting(<tool>) → speaking → awaiting`, plus `error`. Each
  tool call also emits a task-queue entry `{ id, label, status: pending|running|done|failed }`.
- **Brain via `@anthropic-ai/sdk`.** Default driver `claude-sonnet-4-6` with
  `thinking: { type: "adaptive" }`. An **auto-effort controller** picks `output_config.effort`
  per step (low for trivial actions, up to high/max for planning). The hardest sub-tasks
  escalate to `claude-opus-4-8` via a **separate sub-agent call** rather than switching the
  main loop's model (model switches invalidate the model-scoped prompt cache). The Messages
  API is stateless, so model/effort/thinking are chosen per turn. The loop is the **manual
  tool-use loop** (not the auto tool-runner) so the boundary guard can intercept each call.
- **Tools are dedicated and typed**, never a single raw bash blob — `browser.*` (navigate,
  click, type, read via accessibility snapshot, screenshot), `shell.run`, `file.*`, `app.open`,
  `vault.*` (over the existing `ob` CLI), `voice.ask`, `speak`. Typed tools give the harness an
  action-specific hook it can gate, render, and audit.
- **Boundary model = self-judge + thin irreversible floor.** The system prompt makes Maya the
  primary risk judge (she asks when unsure). Underneath, a **pre-execution guard** intercepts
  every tool call and forces confirmation for a fixed set of irreversible categories
  (delete/overwrite file, sudo/install, payment, send/post/publish) that the model cannot talk
  itself out of. A global abort ("Maya, stop" / Esc) cancels in-flight work.
- **Browser via Playwright**, a persistent visible Chromium context at
  `~/.config/maya/browser/` that Raja seeds with logins once. Pages are perceived primarily via
  the accessibility snapshot (structured text for reliable clicking) with screenshots for the
  overlay and visual tasks.
- **Voice out via Piper** (subprocess) — a neural female voice piped through a tunable FX chain
  (subtle ring-mod/formant shimmer + light plate reverb via `sox`), output through `paplay`,
  streamed per sentence. The TTS layer is a **swappable interface** so ElevenLabs can drop in
  later. A `robotIntensity` config knob (0–100%) controls the FX mix.
- **Voice in via clipboard watch + wake word.** `wl-paste --watch` feeds new hyprvox
  transcripts to the daemon; only those beginning with the "Maya" wake word start a command.
  For clarifications/answers, the `voice.ask` tool drives `hyprvox start`, relies on the
  recorder's silence auto-stop (`endOnSilence` / Deepgram endpointing, `maxDuration` cap), and
  consumes the next clipboard transcript while in `awaiting`. Fallback: a ~10s re-arm window if
  auto-stop proves unreliable.
- **Memory** = rolling in-session message buffer + a persistent local cross-day store +
  Obsidian read/write through the `ob` CLI. Phased: session + vault-read first; persistent
  store and vault-write later.
- **Config** at `~/.config/maya/config.json`, validated with a zod schema (API keys, voice
  model, FX/robot knob, wake word, browser profile path). Secrets stay out of prompts/logs.

## Testing Decisions

- **Test external behavior at the highest seam, not internals.** Good tests assert what Maya
  *does* given an input, not how the loop is wired.
- **Boundary guard (highest-value unit seam).** Feed the pre-execution guard a sequence of
  proposed tool calls and assert that each irreversible category returns "needs confirmation"
  and that a denial blocks execution — independent of what the model "decided". This is the
  safety-critical invariant and must be deterministic.
- **Auto-effort controller.** Given a labeled step (trivial click vs multi-step plan), assert
  the chosen `{ model, effort, thinking }` matches the policy table. Pure function, easy to
  pin.
- **Clipboard/wake-word parser.** Given clipboard strings, assert which become commands
  (wake-word match) vs which are ignored, and that `awaiting` consumes the next transcript
  without requiring the wake word.
- **Tool layer with a faked browser.** Drive `browser.*` against a Playwright page pointed at a
  local fixture page; assert navigate/click/type/read produce the expected page state and
  structured snapshot. Mirrors how hyprvox tests its transcribe/merge layers against fixtures.
- **IPC contract.** Assert the daemon broadcasts the expected `state`/task-queue messages on a
  scripted run, and the overlay's state mapper renders the right visual state — mirroring
  hyprvox's `useDaemonState` mapping.
- **Manual end-to-end** (not automated): the plan's verification checklist — terminal-driven
  Phase 1 browser command, floor confirmation, voice playback + robot knob, hands-free
  auto-listen, and the full spoken round trip.

## Out of Scope

- Modifying or contributing to hyprvox itself.
- Deep hyprvox IPC integration (clipboard bridge is the chosen input path for v1).
- Cloud TTS (ElevenLabs) — designed-for but not built in v1; Piper only.
- A standalone wake-word listener / always-hot mic — input is push-to-talk via hyprvox.
- Mobile, web, or cross-machine access; Maya is a local Linux/Hyprland agent.
- Multi-user support and per-user isolation.
- Pixel-level desktop GUI automation of arbitrary apps (browser is the rich surface; desktop
  is shell/app-launch only).
- A general plugin/extension system for third-party tools.

## Further Notes

- Build is phased (0–6) in the approved plan: setup → headless brain → boundaries → voice out →
  voice in → UI → memory/polish. Phase 1 ("open GitHub, read my PRs" from the terminal) is the
  earliest end-to-end proof.
- Reuse, don't reinvent: hyprvox's `src/daemon/ipc.ts`, `overlay/src/renderer/*`,
  `hyprland-rules.conf`, and `LiveWaveform.tsx` are the templates for Maya's IPC, overlay,
  window placement, and speaking animation.
- Security posture matters because Maya holds Raja's logins and can run shell commands:
  prompt-injection from a webpage is an explicit threat the irreversible floor exists to
  contain. Keep the floor enforced in code, not in the prompt.
- No issue tracker is configured in this environment, so this PRD lives as a file. If Raja
  later puts Maya in a GitHub repo (or wires up a tracker), this can be published as the
  first issue with a `ready-for-agent` label.
