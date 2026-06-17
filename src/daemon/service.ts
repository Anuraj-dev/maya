/**
 * Daemon orchestrator. Owns the long-running process and the conversation LOOP:
 *
 *   wake word ("Maya, …")  →  run the task  →  "Activating hyprvox" + open mic  →
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

/** Launch the Electron overlay (top-right oval). Auto-builds the renderer on first run. */
async function launchOverlay(): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  const overlayDir = join(import.meta.dir, "..", "..", "overlay");
  const electron = join(overlayDir, "node_modules", ".bin", "electron");
  const indexHtml = join(overlayDir, "dist", "index.html");

  if (!existsSync(electron)) {
    log(`⚠️  overlay disabled: electron not installed. Run:  cd ${overlayDir} && bun install`);
    return undefined;
  }
  if (!existsSync(indexHtml)) {
    log("🔧 building overlay renderer (first run)…");
    try {
      const b = Bun.spawn(["bun", "run", "build"], { cwd: overlayDir, stdout: "inherit", stderr: "inherit" });
      await b.exited;
    } catch { /* fall through to the existence check */ }
  }
  if (!existsSync(indexHtml)) {
    log(`⚠️  overlay disabled: renderer build missing. Run:  cd ${overlayDir} && bun run build`);
    return undefined;
  }

  try {
    const fd = openSync(OVERLAY_LOG_PATH, "a");
    const proc = Bun.spawn([electron, "."], {
      cwd: overlayDir,
      env: { ...process.env, NODE_ENV: "production" },
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

  const settleTranscript = (text: string) => {
    if (!transcriptResolver) return;
    const resolve = transcriptResolver;
    transcriptResolver = null;
    if (recordTimer) clearTimeout(recordTimer);
    if (windowTimer) clearTimeout(windowTimer);
    resolve(text);
  };

  // Open hyprvox and resolve with the next transcript the watcher delivers. hyprvox auto-stops
  // on silence; recordTimer force-stops if that misfires; windowTimer gives up (returns "").
  const captureNext = async (): Promise<string> => {
    await hyprvox("start");
    if (buffered !== null) {
      const b = buffered;
      buffered = null;
      return b; // user spoke before the mic was fully armed — don't lose it
    }
    return new Promise<string>((resolve) => {
      transcriptResolver = resolve;
      recordTimer = setTimeout(() => void hyprvox("stop"), config.input.maxListenMs);
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
    void hyprvox("stop");
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
        });
      } catch (err) {
        log(`task error: ${err instanceof Error ? err.message : String(err)}`);
        session.set("error", err instanceof Error ? err.message : String(err));
      }
      currentAbort = null;
      if (stopRequested) break;

      // Hands-free follow-up: announce, open the mic, wait for the next task.
      mode = "listening";
      buffered = null;
      session.set("listening", "Listening… say your next task, or say stop.");
      await tts.speak("Activating hyprvox.");
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
    if (parsed.kind !== "command") return; // plain dictation into other apps — ignore
    if (isStopCommand(parsed.text)) return; // nothing running to stop
    void converse(parsed.text);
  });

  session.set("idle", "");

  // --- lifecycle ------------------------------------------------------------
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      log("👋 shutting down.");
      try { watcher.stop(); } catch {}
      try { tts.stop(); } catch {}
      void hyprvox("stop");
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
