# Maya — Production-Readiness & Voice Rearchitecture Plan

> Authored 2026-06-21 from a grill session with Raja. This plan covers (1) re-architecting voice
> input so Maya owns her own capture→STT pipeline and drops the hyprvox/clipboard dependency, and
> (2) the production-hardening decisions that fall out of that — safety, secrets, process model,
> durability, proactivity, barge-in, and testing.
>
> Companion doc: `plan.md` (capability expansion — desktop control, Phases A–D). That plan still
> stands; this one supersedes its voice/barge-in bullets (Phase D) and tightens its safety posture.

---

## 0. The frame

Maya is the **body**; the **brain is an external coding agent** (Claude Code / Codex) over MCP.
The loop is `listen → reason → act → speak → listen`. Today voice input is borrowed from **hyprvox**
via the **shared clipboard**, and the safety model is **audit + undo + payment-gate**.

The grill found that several guarantees Maya *claims* don't actually hold in production, and that the
clipboard-as-IPC voice channel is the root cause of a whole class of bugs. The decisions below fix the
foundations and replace the borrowed voice stack with one Maya owns end to end.

---

## 1. Decisions (the 15 resolved branches)

| # | Branch | Decision |
|---|--------|----------|
| 1 | Shell safety gate | **Tiered — gate only catastrophic patterns** |
| 2 | Prompt injection via tool output | **Trust-boundary tag** on web/file/vault content |
| 3 | Voice input architecture | **Maya owns STT; drop the hyprvox dependency** |
| 4 | STT engine | **Cloud streaming** (Deepgram / Whisper), Raja provides keys |
| 5 | Endpointing | **Provider endpointing** (utterance-end events) |
| 6 | STT failure resilience | **Watchdog + graceful degrade** |
| 7 | Activation | **Local wake word** |
| 8 | Overlay | **Fork saarthi's look; MCP server emits live state events** |
| 9 | State durability | **Fix audit append + GC trash/snapshots + bound undo** |
| 10 | Proactivity | **Event wakes the brain** (listen returns events too) |
| 11 | Interruptibility | **Always-on wake interrupt + cancellation tokens** |
| 12 | Secrets / PII | **Redact audit log + secure API keys** |
| 13 | Process model | **Single audio broker + systemd + single-instance lock** |
| 14 | Legacy code | **Quarantine now, delete after the new path proves out** |
| 15 | Testing | **Port-and-adapter + fakes** (test the logic, thin real adapters) |

---

## 2. Target architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  audio-broker  (systemd --user, owns the mic 24/7, single instance)    │
│    • local wake-word engine on raw mic  → fires on "Maya"              │
│    • on wake OR barge-in: opens cloud STT stream                       │
│    • provider endpointing decides end-of-utterance                     │
│    • watchdog: hard max-duration cap; on drop/auth-fail → close, signal│
│    • emits: wake-detected / listening / transcript / interrupt          │
└───────────────┬───────────────────────────────────┬────────────────────┘
                │ local socket                       │ local socket
        ┌───────▼─────────┐                  ┌────────▼─────────┐
        │   MCP server     │  state events   │  saarthi overlay │
        │  (the brain      │ ───────────────▶│  (GTK, renders   │
        │   spawns it)     │                  │   what Maya does)│
        │  • listen()      │                  └──────────────────┘
        │  • speak() (TTS) │
        │  • all tools     │
        │  • audit/undo    │
        │  • event queue   │
        └──────────────────┘
```

- **One process owns the mic** (the audio broker) and does *both* wake-detection and streaming.
  `listen()` never opens the device itself — it taps the broker. This kills mic contention and, via
  systemd restart, releases a stuck mic after any crash.
- **`listen()` waits for the next *stimulus*** — a wake-word utterance **or** a queued event
  (reminder due, process exited, watcher fired). It returns either `Raja said: …` or `EVENT: …`.
- **The MCP server is the single source of truth** for "what Maya is doing" and pushes state to the
  overlay; the overlay just renders. The brain may *optionally* annotate with a human caption later.

---

## 3. Workstreams

### W1 — Voice rearchitecture (replaces hyprvox)  ⬅ headline
- **W1.1 Audio broker process.** New persistent component (systemd `--user`, restart-on-fail,
  single-instance lock). Owns the mic via PipeWire. Studies hyprvox's architecture for inspiration;
  **does not import or modify hyprvox.**
- **W1.2 Local wake word.** openWakeWord / Porcupine on the raw mic. Only *after* "Maya" fires does
  audio stream to the cloud — caps cost to real turns, keeps idle audio on-box.
- **W1.3 Cloud streaming STT.** Deepgram (or Whisper streaming) over WebSocket. Raja provides the API
  key (stored per §W4). Provider endpointing (`UtteranceEnd` / `speech_final`) ends the turn.
- **W1.4 Watchdog + graceful degrade.** Always run a hard max-duration cap under provider endpointing.
  On socket drop / auth fail / timeout: close mic, speak "I lost the mic, say that again," return
  control. **Never wedge.**
- **W1.5 `listen()` rewrite.** Stop watching the clipboard. Block on the broker's
  next-stimulus signal; return transcript or event. Remove `src/input/clipboard.ts` from the voice path.
- **Eliminates:** clipboard-as-command bugs, mic-left-open-on-crash, the "never modify hyprvox"
  coupling, and the no-endpointing limitation of toggle-mode.

### W2 — Proactivity (event wakes the brain)
- **W2.1 Event queue.** Reminder-due, process-exited, file/watcher events enqueue a stimulus.
- **W2.2 `listen()` returns events.** The brain reasons about `EVENT: build #3 finished` and speaks —
  one loop serves both voice and proactivity. Keep the existing reminder service as the *timer source*,
  but route its firings through the brain instead of canned notify/speak when reasoning is wanted.

### W3 — Interruptibility / barge-in
- **W3.1 Always-on wake interrupt.** The wake engine keeps running during speak / think / tool-exec.
  "Maya" (or "Maya stop") raises an **interrupt event**.
- **W3.2 Cancellation path.** A cancellation token threaded through long-running tools (`shell_run`,
  browser, `proc_*`) and TTS playback. Interrupt → kill current TTS, signal the brain to halt/replan,
  `stopAll()` background procs if asked.

### W4 — Safety, secrets, durability
- **W4.1 Tiered catastrophic gate.** Gate only truly unrecoverable shell patterns (`rm -rf` on
  home/root, `dd` to a disk, `mkfs`, fork bombs, `curl … | sh`). Everything else runs. **Fix the
  `shell_run` description** so it stops promising confirmation it doesn't deliver.
  - ⚠️ Known limit: a pattern gate cannot catch a cleverly-worded injected exfil
    (`find ~ -name '*.key' -exec curl …`). That residual risk is accepted, mitigated only by W4.2.
- **W4.2 Trust-boundary tag.** Mark `browser_read` / `file_read` / vault output to the brain as
  *untrusted data, not instructions*. Lightweight; relies on the model not acting on embedded commands.
- **W4.3 Audit = true append.** Switch `audit.ts` from read-rewrite (lines 57–58) to `O_APPEND`
  append so concurrent reminder firings + tool calls don't lose lines.
- **W4.4 Redaction + key hygiene.** Scrub token/key/password/auth patterns before writing audit
  entries. STT/API keys live in `$MAYA_DIR/.env` (or secret store), `0600`, gitignored — never in repo.
- **W4.5 Retention.** GC trash + snapshots older than N days; cap undo-stack depth so a stray "undo"
  can't reach an unrelated op from days ago, and disk can't fill.

### W5 — Process model & supervision
- **W5.1 systemd `--user` units** for the audio broker and the overlay, restart-on-fail.
- **W5.2 Single-instance lock** on the MCP server so only one brain drives shared state
  (reminders.json, audit, mic, speaker).
- **W5.3 Broker is the sole mic owner** — see §2.

### W6 — Overlay (saarthi)
- Fork saarthi's GTK look-and-feel as the visual base; build Maya's needs on top.
- Data feed: the **MCP server emits hard state** (idle / wake-detected / listening / thinking /
  speaking / tool X running) over a local socket; overlay renders. Optional later: a `set_status`
  tool for human captions.

### W7 — Legacy cleanup
- **Quarantine** `src/brain/*`, `src/agent/*`, `src/daemon/service.ts`, the Electron overlay, and
  `src/ipc/*` into a `legacy/` dir excluded from build/typecheck. Delete once the new path is the daily
  driver.
- ⚠️ **Tension to resolve at cut time:** `maya ask` / `runOnce` runs through `src/brain/*` and the
  memory says it must never break. Options: keep a *minimal* brain module alive for `maya ask`, or
  migrate `maya ask` to drive the MCP tools. Decide before quarantining the brain.

### W8 — Testing (port-and-adapter + fakes)
- Put **audio / STT / wake / TTS / systemd** behind interfaces. Unit-test the **logic**
  deterministically against fakes:
  - endpointing state machine, event-vs-wake routing, watchdog timeouts,
  - cancellation / barge-in, audit redaction, undo + GC retention, single-instance lock.
- Keep real I/O in **thin adapters** covered by a short **manual smoke checklist**.
- Fits the existing pure-core / deterministic-`tick()` pattern (`floor`, `effort`, `clipboard`,
  reminders).

---

## 4. Suggested sequencing

1. **W4.3 + W4.4 + W4.5** (durability + secrets) — small, foundational, makes "ungated but safe" true.
2. **W4.1 + W4.2** (tiered gate + trust tag + honest docs) — closes the biggest lie in the current code.
3. **W1** (audio broker → wake word → cloud STT → watchdog → `listen()` rewrite) — the headline.
4. **W5** (systemd + single-instance + mic ownership) — lands alongside W1; the broker needs it.
5. **W2 + W3** (proactivity events + barge-in) — once the loop runs on the new broker.
6. **W6** (saarthi overlay) — in parallel once the MCP server emits state.
7. **W7** (quarantine legacy) — after the new path is the daily driver.
8. **W8** runs throughout — write the fake-backed spec before each slice (spec-by-test).

---

## 5. Open items needing Raja

1. **STT provider** — Deepgram vs OpenAI Whisper streaming (which key are you providing)?
2. **Wake engine** — openWakeWord (open, free) vs Porcupine (better, free tier + account)?
3. **`maya ask` fate** (§W7 tension) — keep a minimal brain, or move it onto MCP tools?
4. **Retention window** — how many days of trash/snapshots, and max undo depth?
5. **Budget ceiling** — a monthly cap / alarm on the STT meter, since cloud STT is a new recurring cost?

---

## 6. TDD seed (already written, green)

The four highest-risk pure cores are implemented test-first and passing, as the spec the rest of
each workstream implements against:

| Core | File | Spec | Covers |
|------|------|------|--------|
| Catastrophic gate | `src/safety/catastrophic.ts` | `catastrophic.test.ts` | W4.1 — tiered shell gate |
| Audit redaction | `src/safety/redact.ts` | `redact.test.ts` | W4.4 — secrets out of the log |
| Retention | `src/safety/retention.ts` | `retention.test.ts` | W4.5 — GC + bounded undo |
| Voice turn machine | `src/voice/turn.ts` | `turn.test.ts` | W1/W1.4/W2/W3 — endpointing, watchdog, events, barge-in |

**Workflow per remaining slice (spec-by-test):**
1. Write the fake-backed spec first (state machine / pure core), watch it fail (red).
2. Implement the core to green.
3. Wire the core into the thin I/O adapter (MCP server / audio broker / audit.ts) — covered by the
   manual smoke checklist, not unit tests.

**Next wiring steps (not yet done — these touch real I/O):**
- `server.ts`: consult `classifyCatastrophic` for `shell_run` (gate like a payment); fix the lying
  `shell_run` description.
- `audit.ts`: switch to append mode; pipe inputs through `redactSecrets`; run `selectExpired` +
  `boundUndoStack` on a timer.
- audio broker: drive `reduceTurn` from real PipeWire + wake-word + cloud-STT signals.

---

## 7. Residual accepted risks (eyes-open)

- Pattern-based shell gate won't catch a well-worded injected exfil command (W4.1).
- Trust-boundary tag is advisory — a determined injection can still fool the model (W4.2).
- Provider endpointing can clip on long mid-sentence pauses (tune the silence window; W1.3).
- Cloud STT ships utterance audio off-box after wake — privacy trade accepted for quality (W1.3).
