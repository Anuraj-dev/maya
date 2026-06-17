/**
 * Daemon orchestrator. Owns the long-running process and the conversation LOOP:
 *
 *   wake word ("Maya, …")  →  run the task  →  overlay "You can speak now" + open mic  →
 *   hear the next task     →  run it        →  … keep going until you say "stop".
 *
 * So you give one wake-word command to start, then just keep talking — Maya re-opens the mic
 * after every task and only drops back to wake-word idle when you say "stop" or stay silent.
 *
 * The overlay reads live state over the WebSocket OverlayBridge (the same channel `maya live`
 * uses and the Electron Widget subscribes to), so starting the daemon lights up the on-screen
 * oval in the top-right and shows what Maya is doing in real time.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, MAYA_DIR, type Config } from "../config/index.ts";
import { OverlayBridge } from "../overlay/bridge.ts";
import { createLiveSession } from "../overlay/session.ts";
import { runOnce } from "../agent/loop.ts";
import { closeBrowser } from "../tools/browser.ts";
import { createTts } from "../voice/tts.ts";
import { startClipboardWatcher, parseTranscript, isStopCommand, type ClipboardWatcher } from "../input/clipboard.ts";

export interface StartOptions {
  overlay: boolean;
}

const DAEMON_PID_PATH = join(MAYA_DIR, "daemon.pid");
const OVERLAY_LOG_PATH = join(MAYA_DIR, "overlay.log");

function log(msg: string): void {
  const t = new Date().toLocaleTimeString();
  console.error(`[${t}] ${msg}`);
}

// ---------------------------------------------------------------------------
// PID / single-instance helpers
// ---------------------------------------------------------------------------

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(): number | null {
  if (!existsSync(DAEMON_PID_PATH)) return null;
  const pid = Number(readFileSync(DAEMON_PID_PATH, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

// ---------------------------------------------------------------------------
// hyprvox + overlay process control
// ---------------------------------------------------------------------------

let hyprvoxBin: string | null | undefined;
async function resolveHyprvox(): Promise<string | null> {
  if (hyprvoxBin !== undefined) return hyprvoxBin;
  const onPath = await Bun.which("hyprvox");
  const fallback = join(process.env.HOME ?? "", ".local", "bin", "hyprvox");
  hyprvoxBin = onPath ?? (existsSync(fallback) ? fallback : null);
  return hyprvoxBin;
}

async function hyprvox(cmd: "start" | "stop" | "toggle"): Promise<void> {
  const bin = await resolveHyprvox();
  if (!bin) {
    log(`⚠️  hyprvox not found — cannot ${cmd} the mic. Install hyprvox or put it on PATH.`);
    return;
  }
  try {
    const p = Bun.spawn([bin, cmd], { stdout: "ignore", stderr: "ignore" });
    await p.exited;
  } catch {
    /* best effort — a flaky mic must not crash the daemon */
  }
}

/** Launch the GTK overlay (top-right HUD). Uses WebKit2GTK + layer-shell. */
async function launchOverlay(): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  const overlayDir = join(import.meta.dir, "..", "..", "overlay");
  const hostScript = join(overlayDir, "host.py");

  if (!existsSync(hostScript)) {
    log(`⚠️  overlay disabled: host.py not found at ${hostScript}`);
    return undefined;
  }

  const python3 = await Bun.which("python3");
  if (!python3) {
    log("⚠️  overlay disabled: python3 not found on PATH");
    return undefined;
  }

  try {
    const fd = openSync(OVERLAY_LOG_PATH, "a");
    const proc = Bun.spawn([python3, hostScript], {
      cwd: overlayDir,
      env: { ...process.env },
      stdout: fd,
      stderr: fd,
    });
    log(`🪟 overlay launched (logs: ${OVERLAY_LOG_PATH}). It docks top-right and stays on top.`);
    return proc;
  } catch (err) {
    log(`⚠️  overlay failed to launch: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Daemon
// ---------------------------------------------------------------------------

export async function startDaemon(opts: StartOptions): Promise<void> {
  const existing = readPid();
  if (existing && isAlive(existing)) {
    console.log(`maya: already running (pid ${existing}).`);
    return;
  }
  writeFileSync(DAEMON_PID_PATH, String(process.pid));

  const config = await loadConfig();
  const tts = await createTts(config);
  const bridge = new OverlayBridge();
  const overlayProc = opts.overlay ? await launchOverlay() : undefined;

  log(`🛰  Maya daemon up (pid ${process.pid}). Bridge ${bridge.url}.`);
  log(`Say "${config.input.wakeWord}, <task>" to begin. After each task Maya re-opens the mic; say "stop" to end.`);

  // --- conversation state ---------------------------------------------------
  // mode: idle = wake-word armed · running = executing a task · listening = mic open for next
  let mode: "idle" | "running" | "listening" = "idle";
  let transcriptResolver: ((text: string) => void) | null = null;
  let buffered: string | null = null; // transcript heard while listening before the mic was armed
  let recordTimer: ReturnType<typeof setTimeout> | undefined;
  let windowTimer: ReturnType<typeof setTimeout> | undefined;
  let currentAbort: { aborted: boolean } | null = null;
  let stopRequested = false;
  let micActive = false; // true while we hold an open hyprvox toggle (recording in progress)

  const settleTranscript = (text: string) => {
    if (!transcriptResolver) return;
    const resolve = transcriptResolver;
    transcriptResolver = null;
    if (recordTimer) clearTimeout(recordTimer);
    if (windowTimer) clearTimeout(windowTimer);
    micActive = false;
    resolve(text);
  };

  // Open hyprvox and resolve with the next transcript the watcher delivers.
  // hyprvox is pure PTT: "toggle" starts recording; "toggle" again stops + transcribes.
  // recordTimer force-stops after maxListenMs; windowTimer gives up if transcript never arrives.
  const captureNext = async (): Promise<string> => {
    if (buffered !== null) {
      const b = buffered;
      buffered = null;
      return b; // user spoke before the mic was armed — don't lose it
    }
    micActive = true;
    await hyprvox("toggle"); // start recording
    return new Promise<string>((resolve) => {
      transcriptResolver = resolve;
      recordTimer = setTimeout(() => {
        if (micActive) { micActive = false; void hyprvox("toggle"); } // stop recording
      }, config.input.maxListenMs);
      windowTimer = setTimeout(() => settleTranscript(""), config.input.maxListenMs + config.input.followUpWindowMs);
    });
  };

  // voice_ask (mid-task clarification): the session already spoke the question + set "listening".
  const session = createLiveSession(bridge, { tts, listen: () => captureNext() });

  const abortCurrent = (spoken = true) => {
    log("🛑 stop / abort");
    stopRequested = true;
    if (currentAbort) currentAbort.aborted = true;
    tts.stop();
    if (micActive) { micActive = false; void hyprvox("toggle"); } // stop recording if open
    settleTranscript(""); // unblock any pending listen
    mode = "idle";
    session.set("idle", "");
    if (spoken) void tts.speak("Okay, stopping.");
  };
  bridge.onAbort(() => abortCurrent());

  // The conversation loop: run a task, then re-open the mic for the next, until stop/silence.
  const converse = async (firstCommand: string) => {
    let command = firstCommand;
    stopRequested = false;

    while (true) {
      mode = "running";
      currentAbort = { aborted: false };
      log(`▶️  task: ${command}`);
      try {
        await runOnce(command, {
          sink: session.sink,
          deps: { voiceAsk: session.voiceAsk },
          abort: currentAbort,
          config,
          keepBrowser: true, // daemon owns browser lifecycle; closed in shutdown
        });
      } catch (err) {
        log(`task error: ${err instanceof Error ? err.message : String(err)}`);
        session.set("error", err instanceof Error ? err.message : String(err));
      }
      currentAbort = null;
      if (stopRequested) break;

      // Hands-free follow-up: show "You can speak now" on the overlay, open mic silently.
      mode = "listening";
      buffered = null;
      session.set("listening", "You can speak now");
      log("🎙  listening for next task…");
      const next = (await captureNext()).trim();
      if (stopRequested) break;

      if (!next) {
        log("…silence — back to wake-word idle.");
        session.set("idle", "");
        await tts.speak(`Standing by. Say ${config.input.wakeWord} when you need me.`);
        break;
      }

      // In the loop the wake word is optional; strip it if present.
      const parsed = parseTranscript(next, { awaiting: false, config });
      const stripped = parsed.kind === "command" ? parsed.text : next;
      if (isStopCommand(stripped)) {
        log("heard stop — ending loop.");
        session.set("idle", "");
        await tts.speak("Okay, stopping.");
        break;
      }

      // Brief "got it" acknowledgement on the overlay before the next task spins up.
      log(`👂 follow-up: "${stripped}"`);
      session.set("thinking", `Got it — "${stripped.length > 50 ? stripped.slice(0, 50) + "…" : stripped}"`);
      command = stripped;
    }

    mode = "idle";
    session.set("idle", "");
  };

  // --- clipboard → intent ---------------------------------------------------
  const watcher: ClipboardWatcher = startClipboardWatcher((raw) => {
    const text = raw.trim();
    if (!text) return;
    log(`👂 heard: "${text}" (mode=${mode})`);

    // A pending listen (follow-up or mid-task voice_ask) consumes the next transcript directly.
    if (transcriptResolver) {
      settleTranscript(text);
      return;
    }

    // Listening window open but mic not armed yet (still announcing): hold it for captureNext.
    if (mode === "listening") {
      buffered = text;
      return;
    }

    if (mode === "running") {
      // While busy, only "Maya, stop" interrupts; everything else is ignored.
      const parsed = parseTranscript(text, { awaiting: false, config });
      if (parsed.kind === "command" && isStopCommand(parsed.text)) abortCurrent();
      return;
    }

    // idle: require the wake word.
    const parsed = parseTranscript(text, { awaiting: false, config });
    if (parsed.kind !== "command") return;
    if (isStopCommand(parsed.text)) return; // nothing running to stop
    void converse(parsed.text);
  });

  session.set("idle", "");
  log(`🎙  ready — press your hyprvox key, say "${config.input.wakeWord}, <task>", then press it again to transcribe.`);

  // --- lifecycle ------------------------------------------------------------
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      log("👋 shutting down.");
      try { watcher.stop(); } catch {}
      try { tts.stop(); } catch {}
      void closeBrowser(); // close browser kept alive across tasks
      try { bridge.stop(); } catch {}
      try { overlayProc?.kill(); } catch {}
      try { unlinkSync(DAEMON_PID_PATH); } catch {}
      resolve();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

export async function stopDaemon(): Promise<void> {
  const pid = readPid();
  if (!pid || !isAlive(pid)) {
    console.log("maya: not running.");
    try { unlinkSync(DAEMON_PID_PATH); } catch {}
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`maya: stopped (pid ${pid}).`);
  } catch (err) {
    console.error(`maya: failed to stop pid ${pid}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function daemonStatus(): Promise<void> {
  const pid = readPid();
  if (pid && isAlive(pid)) console.log(`maya: running (pid ${pid}).`);
  else console.log("maya: not running.");
}
