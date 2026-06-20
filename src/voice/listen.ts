/**
 * listen — open the mic and capture the user's next spoken command.
 *
 * This is the wire that lets an external brain (Claude Code / Codex, over MCP) drive Maya by
 * VOICE: the agent calls the `listen` tool, which blocks here until the user finishes speaking,
 * then returns the transcript. The agent reasons, acts via Maya's tools, calls `speak`, then
 * calls `listen` again — that loop is the whole product.
 *
 * hyprvox reality (verified): it is pure push-to-talk in toggle mode — `hyprvox toggle` starts
 * recording, a second toggle stops it and writes the transcript to the clipboard. There is NO
 * silence auto-stop in toggle mode. So we:
 *   1. optionally open the mic for the user (`hyprvox toggle`) so the start is hands-free,
 *   2. watch the clipboard for the next NEW transcript hyprvox produces (when the user presses
 *      their PTT key to stop, or we force-stop at maxListenMs),
 *   3. return that transcript.
 *
 * We never modify hyprvox — we only drive its CLI and read the clipboard, exactly like the daemon.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config/index.ts";
import { startClipboardWatcher } from "../input/clipboard.ts";

let hyprvoxBin: string | null | undefined;
async function resolveHyprvox(): Promise<string | null> {
  if (hyprvoxBin !== undefined) return hyprvoxBin;
  const onPath = await Bun.which("hyprvox");
  const fallback = join(process.env.HOME ?? "", ".local", "bin", "hyprvox");
  hyprvoxBin = onPath ?? (existsSync(fallback) ? fallback : null);
  return hyprvoxBin;
}

async function toggleMic(bin: string): Promise<void> {
  try {
    await Bun.spawn([bin, "toggle"], { stdout: "ignore", stderr: "ignore" }).exited;
  } catch {
    /* a flaky mic must never throw into the listen loop */
  }
}

export interface ListenResult {
  transcript: string;
  timedOut: boolean;
  /** True when hyprvox isn't installed, so the caller can explain instead of silently timing out. */
  micUnavailable: boolean;
}

/**
 * Capture one spoken command. Resolves with the transcript, or an empty transcript on timeout.
 * `openMic` (default true) toggles hyprvox on so the user doesn't have to press to start; the
 * user presses their PTT key to stop, or we force-stop after config.input.maxListenMs.
 */
export async function listenOnce(
  config: Config,
  opts: { openMic?: boolean } = {},
): Promise<ListenResult> {
  const bin = await resolveHyprvox();
  if (!bin && opts.openMic !== false) {
    return { transcript: "", timedOut: false, micUnavailable: true };
  }

  return new Promise<ListenResult>((resolve) => {
    let settled = false;
    let micOpen = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const watcher = startClipboardWatcher((text) => {
      const t = text.trim();
      if (!t) return;
      // A transcript means hyprvox already stopped recording on its own (user pressed PTT, or
      // our force-stop flushed it) — so the mic is closed; don't toggle it again in cleanup.
      micOpen = false;
      finish({ transcript: t, timedOut: false, micUnavailable: false });
    });

    const cleanup = () => {
      watcher.stop();
      clearTimeout(hardTimer);
      if (graceTimer) clearTimeout(graceTimer);
      if (micOpen && bin) {
        micOpen = false;
        void toggleMic(bin); // close the mic we opened
      }
    };

    const finish = (result: ListenResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    if (opts.openMic !== false && bin) {
      micOpen = true;
      void toggleMic(bin); // hands-free start
    }

    // At maxListenMs, force-stop recording so hyprvox flushes whatever it heard, then give the
    // transcript a short grace to land on the clipboard before giving up.
    const hardTimer = setTimeout(() => {
      if (micOpen && bin) {
        micOpen = false;
        void toggleMic(bin);
        graceTimer = setTimeout(
          () => finish({ transcript: "", timedOut: true, micUnavailable: false }),
          4000,
        );
      } else {
        finish({ transcript: "", timedOut: true, micUnavailable: false });
      }
    }, config.input.maxListenMs);
  });
}
