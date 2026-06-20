# Maya — Capability Expansion Plan

> Living plan for turning Maya from a browser-puppeteer into a true Jarvis-class body with
> full control of the machine. Authored 2026-06-20. Brainstormed with Raja; decisions and
> open questions recorded below. Selected work is in **Phase A/B**; everything else is captured
> as **future plan** so nothing is lost.

---

## 1. Where Maya is today

Maya is the **body**; the **brain is an external coding agent** (Claude Code / Codex) over MCP
(`maya mcp`). The loop is `listen → reason → act → speak → listen`. No model runs inside Maya.

Current control surface (the MCP tools):

| Surface | Tools | Reality |
|---|---|---|
| Browser (Playwright) | navigate, read (ARIA), click, click_selector, type, type_selector, press_key, eval, scroll, screenshot | **Rich** — the only place she can perceive *and* act in a closed loop |
| Shell | `shell_run` | One-shot, 30s cap, no session, no background processes |
| Files | read, write, delete | Trash + snapshot + `undo` |
| Sensing | screenshot (grim), clipboard r/w, `get_context` | `get_context` is **broken on KDE** (see §2) |
| Apps | `app_open` | **Launch only** — no control after launch |
| Vault | read, search, append, write (`ob`) | Fine |
| Memory | save, forget | Flat JSON injected into the brain's prompt |
| Voice | `listen` (hyprvox PTT), `speak` (Piper + FX) | Works; voice quality + barge-in are future |
| Safety | audit log + undo + payment hard-gate | Light by design |

**The core limitation:** Maya is a *browser puppeteer in a Jarvis costume*. The browser is the
only surface with a perceive→act loop. The real desktop — native apps, windows, input, media,
system state — is almost entirely out of reach. `app_open` can launch Obsidian but can't click,
type, focus, or read it.

---

## 2. Environment reality check (read this before writing any desktop code)

Detected on Raja's machine 2026-06-20:

- **Session:** Wayland, `XDG_CURRENT_DESKTOP=KDE` → **KDE Plasma on KWin**, *not Hyprland*.
- The codebase is written for **Hyprland** throughout (`hyprctl`, `hyprvox`, hyprland-rules).
  Raja has **not migrated to Hyprland yet**, so all Hyprland assumptions are currently wrong.

**Tool availability on this box:**

| Need | Present | Missing |
|---|---|---|
| Notifications | `notify-send` ✅ | — |
| Audio | `wpctl` ✅ `pactl` ✅ | `playerctl` (use MPRIS via `gdbus`) |
| Network | `nmcli` ✅ | — |
| Bluetooth | `bluetoothctl` ✅ | — |
| D-Bus | `gdbus` ✅ `busctl` ✅ | `qdbus` |
| Window mgmt / active window | — | `hyprctl`, `xdotool`, `wmctrl`, `swaymsg` (use **KWin D-Bus / kdotool**) |
| Input synthesis (mouse/keys) | — | `ydotool`, `wtype`, `dotool` |
| Brightness | — | `brightnessctl` (use `/sys/class/backlight` or KDE PowerManagement D-Bus) |
| OCR / a11y tree | — | `tesseract`, `at-spi2-core` |

**Consequences:**
1. **`get_context` is broken right now** — it calls `hyprctl` then `xdotool`; neither exists. First
   correctness fix: reimplement it on **KWin** (active window via KWin scripting over `gdbus`).
2. Desktop control on KDE Wayland uses a *different* stack than Hyprland: **KWin D-Bus / `kdotool`**
   for windows and **`ydotool`** (uinput-level, compositor-independent) for input synthesis.
3. **Screenshots are rejected for the action loop** (Raja: "screenshots take time to load, not a good
   option"). Screenshot stays a *see-once* sense only. The action loop must be structured + fast.

---

## 3. Brainstorm decisions (from Raja)

- **North star (selected):** (1) **Universal desktop control**, (2) **Proactivity & triggers**.
- **Control method:** input-synthesis/structured is preferred over vision; **screenshots rejected for
  speed**. Hyprland input-synthesis ("option 1") is the eventual target but Raja isn't on Hyprland yet,
  so the **current target is the KDE/KWin equivalent**. Method detail deferred into this plan.
- **Working style:** **spec-by-test first** — encode behaviors in `brainstorm-features.test.ts`, then
  implement to green. Matches the existing pure-seam tests (`floor`, `effort`, `clipboard`).
- **Safety appetite:** **don't slow me down** — keep audit + undo + payment gate. (Add an optional global
  kill switch as a cheap nicety; no heavy guardrails.)

**Design principles for new tools (so the AI brain uses them well):**
- Expose **primitives + perception**, not canned macros — the capable brain orchestrates.
- **Every action returns enough state to verify it worked** (close the loop the way the browser does).
- **Fast & structured** — D-Bus / CLI calls, never a screenshot round-trip in the hot path.
- **Compositor-portable where cheap**: detect KWin vs Hyprland vs X11, pick the backend at runtime.
- **Pure, testable cores**: command-builders and parsers are pure functions; execution is a thin shell.

---

## 4. Roadmap

### Phase A — Proactivity + system senses (NOW, zero installs) ✅ all deps present
The compositor-agnostic, no-install slice. Highest value-per-effort and unblocked by the Hyprland question.

- **A1. Notifications & reminders (proactivity core)**
  - `notify` — desktop notification via `notify-send` (urgency, title, body, optional app icon).
  - `remind` — schedule a future `notify`/`speak` after `delaySeconds` or at an ISO time; persisted to
    `~/.config/maya/reminders.json` so it survives an MCP restart; reloaded on start.
  - `reminders_list` / `reminder_cancel`.
  - Brain converts natural language ("in 5 min", "at 3pm") → seconds; the body stays a primitive.
- **A2. System-state sense (read-only)**
  - `system_state` — battery (`/sys`/upower), CPU/mem/disk (`/proc`, `df`), network (`nmcli`),
    now-playing (MPRIS via `gdbus`), volume (`wpctl`), uptime. One fast structured snapshot for
    "what's the state of my machine".
- **A3. Audio / media control**
  - `audio` — get/set volume, mute/unmute, list/switch sinks (`wpctl`/`pactl`).
  - `media` — play/pause/next/prev/stop via MPRIS (`gdbus`; recommend `playerctl` if Raja installs it).
- **A4. Fix `get_context` for KWin** — active window title + class via KWin scripting over `gdbus`;
  keep Hyprland/X11 fallbacks. Correctness fix + foundation for desktop control.
- **A5. `notify` available to the daemon path too** (not just MCP) — optional.

### Phase B — Universal desktop control (needs installs; the headline north-star item)
Requires Raja to install backends; gated behind a capability check that degrades gracefully.

- **B1. Window management** (`desktop_*`): list windows, focus, move, resize, tile/maximize, close,
  switch workspace/virtual-desktop. Backend: **KWin D-Bus / `kdotool`** now; **`hyprctl dispatch`**
  when on Hyprland. Single `desktop` tool group with a runtime-selected backend.
- **B2. Input synthesis** (`desktop_click_at`, `desktop_move`, `desktop_drag`, `desktop_type`,
  `desktop_hotkey`): mouse + keyboard at the uinput level via **`ydotool`** (compositor-independent).
  Needs `ydotoold` + uinput permissions — document the one-time setup.
- **B3. Perceive-to-act without screenshots**: prefer the **AT-SPI accessibility tree** (`at-spi2`,
  install) to read native-app widgets as structured elements (like the browser's ARIA), so the brain
  can target by name/role and synthesize input — *no pixel guessing, no screenshot latency*.
- **Open dependency:** confirm `ydotool` + `kdotool` install + permissions with Raja before B starts.

### Phase C — Power dev/system control (Raja's chosen bucket #3 — IN PROGRESS)
- **Background process manager** ✅ BUILT (2026-06-20): `proc_start` / `proc_list` / `proc_logs` /
  `proc_stop` in src/tools/process.ts + core in src/system/processes.ts. Long-running commands run
  detached, output captured to `<MAYA_DIR>/proc/<id>.log`, tail-able and stoppable. Removes the 30s
  one-shot limit. The manager's `stopAll()` is the seed of the panic/kill-switch. (Lifetime = MCP
  session; reattach-across-restart is future.)
- **System-state sense** (`system_state`) — NEXT: battery/cpu/mem/disk/net/now-playing/volume/uptime.
- **Audio + media control** (`audio`, `media`) — NEXT: wpctl/pactl + MPRIS via gdbus.
- Persistent **shell sessions** (PTY): cwd/env survive across calls; stream output. (later)
- **Richer browser**: tabs/pages, downloads, uploads, `wait_for(selector|text|url)`, network inspection,
  cookie/storage export for "log me into X".
- First-class **filesystem navigation**: `list_dir`, `find_files`, `tree` as typed tools (today only raw
  `shell_run` + single-file `file_read`).
- More system toggles: brightness, bluetooth pair/connect, wifi connect, power profile, DND toggle.

### Phase D — Sharper senses & voice (FUTURE — not selected, captured per Raja's request)
- **Fused perception**: one `what_am_i_looking_at` that combines active window + open windows +
  now-playing + foreground app's a11y tree — structured, fast, no screenshot.
- **Voice**: swap/augment Piper with a more human + streaming voice (the TTS interface is already
  swappable for ElevenLabs); **barge-in / interrupt** so Raja can cut Maya off mid-sentence; emotional
  prosody; "Maya, stop" detected mid-action.
- **Vision as last-resort fallback only**: screenshot → OCR (`tesseract`) → click-at, used only when no
  a11y tree exists. Explicitly *not* the primary loop (too slow per Raja).
- **Portable "Maya soul"**: a persona/system-prompt fragment the external brain loads so her identity is
  consistent across Claude Code / Codex.

---

## 5. Control-method decision record

- **Chosen for action:** structured input synthesis + window control via **D-Bus/CLI backends**, selected
  at runtime by compositor (KWin now, Hyprland later, X11 fallback). Fast, no screenshot in the hot path.
- **Rejected for the hot path:** vision/coordinate computer-use (screenshot → click x,y). Too slow; kept
  only as a Phase-D last-resort fallback for apps with no accessibility tree.
- **Deferred:** Hyprland-native backend (`hyprctl dispatch`, `wtype`) — ready to switch on when Raja
  migrates; the `desktop` tool group is written backend-agnostic so the switch is a config flip.

---

## 6. Safety posture

Keep the current model — **audit log + undo + payment hard-gate** — and do not add friction (Raja:
"don't slow me down"). One cheap addition worth doing alongside input synthesis: a **global kill switch**
("Maya, stop" / a `panic` tool) that cancels in-flight input synthesis and background processes, since
synthetic mouse/keyboard has a bigger blast radius than a browser click. No previews/allowlists for now.

---

## 7. Open questions for Raja

1. **Installs for Phase B** — OK to `sudo dnf install ydotool kdotool` (and set up the `ydotoold`
   uinput permission)? Without them, universal desktop control can't act on native apps.
2. **Hyprland timeline** — roughly when do you expect to migrate? Decides how much KWin-specific work is
   worth polishing vs. treating as a bridge.
3. **Phase A order** — start with proactivity (A1) or the `get_context` fix (A4)? (Plan assumes A1 first.)
4. **`playerctl`** — install it for clean MPRIS media control, or keep the `gdbus` MPRIS path (zero install)?
```
