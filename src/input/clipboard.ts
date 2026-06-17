/**
 * Voice input bridge. hyprvox drops transcripts on the clipboard; we watch it.
 *
 * - Watch new clipboard text. Primary path: `wl-paste --watch` (event-driven, fires even when
 *   the same text is copied twice). Fallback: poll `wl-paste -n` for compositors that lack the
 *   wlroots data-control protocol (`--watch` errors there).
 * - Normal mode: only text starting with the wake word ("maya, ...") starts a command.
 * - AWAITING mode: the next transcript is consumed as the user's answer WITHOUT the wake word
 *   (used after Maya asks a question and auto-drives `hyprvox start`).
 *
 * This module does pure parsing + a watcher that emits raw transcripts; the daemon decides what
 * to do with them (wake-word match, answer capture, abort).
 */
import type { Config } from "../config/index.ts";

export interface ParsedInput {
  /** "command" once the wake word matched, "answer" while awaiting, else "ignore". */
  kind: "command" | "answer" | "ignore";
  text: string;
}

/** Pure: classify a clipboard transcript given current mode. Unit-testable. */
export function parseTranscript(
  raw: string,
  opts: { awaiting: boolean; config: Config },
): ParsedInput {
  const text = raw.trim();
  if (!text) return { kind: "ignore", text };

  if (opts.awaiting) return { kind: "answer", text };

  const wake = opts.config.input.wakeWord.toLowerCase();
  const lower = text.toLowerCase();
  if (lower === wake || lower.startsWith(`${wake} `) || lower.startsWith(`${wake},`)) {
    const stripped = text.slice(wake.length).replace(/^[\s,]+/, "");
    return { kind: "command", text: stripped };
  }
  return { kind: "ignore", text };
}

/** Does this stripped command mean "abort" ("Maya, stop")? Pure + testable. */
export function isStopCommand(strippedCommand: string): boolean {
  return /^stop\b/i.test(strippedCommand.trim());
}

// ---------------------------------------------------------------------------
// Watcher
// ---------------------------------------------------------------------------

const WATCH_FAIL_GRACE_MS = 1500; // if `--watch` dies this fast, treat it as unsupported
const POLL_INTERVAL_MS = 350;

export interface ClipboardWatcher {
  stop(): void;
}

/**
 * Start watching the clipboard for new text. Calls `onText` with each new transcript.
 *
 * Tries `wl-paste --watch` first (each change runs a tiny base64 emitter so multi-line and
 * repeated transcripts are delivered as clean, newline-delimited records). If that path is
 * unsupported (no wlr-data-control) or dies immediately, falls back to polling. Either way the
 * value present at start time is NOT emitted — we only react to changes after we begin watching.
 */
export function startClipboardWatcher(onText: (text: string) => void): ClipboardWatcher {
  let stopped = false;
  let watchProc: ReturnType<typeof Bun.spawn> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let fellBack = false;

  const startPolling = async () => {
    if (stopped || pollTimer) return;
    fellBack = true;
    let last = await readClipboard(); // seed with current value so we don't fire on startup
    pollTimer = setInterval(async () => {
      if (stopped) return;
      const cur = await readClipboard();
      if (cur !== last) {
        last = cur;
        if (cur.trim()) onText(cur);
      }
    }, POLL_INTERVAL_MS);
  };

  try {
    // Each clipboard change runs the inner sh, which reads the current clipboard ITSELF (more
    // robust than relying on --watch piping it to stdin), base64-encodes it, and adds a newline —
    // giving us unambiguous record boundaries even for multi-line transcripts.
    watchProc = Bun.spawn(
      ["wl-paste", "-t", "text", "--watch", "sh", "-c", 'wl-paste -n -t text | base64 -w0; printf "\\n"'],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );

    const started = Date.now();
    // If --watch exits quickly (unsupported compositor), fall back to polling.
    watchProc.exited.then(() => {
      if (stopped) return;
      if (!fellBack && Date.now() - started < WATCH_FAIL_GRACE_MS) void startPolling();
      else if (!fellBack) void startPolling(); // also recover if it dies later
    });

    void consumeLines(watchProc.stdout as ReadableStream<Uint8Array>, (line) => {
      const decoded = decodeBase64Line(line);
      if (decoded.trim()) onText(decoded);
    });
  } catch {
    void startPolling();
  }

  return {
    stop() {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      try { watchProc?.kill(); } catch { /* already gone */ }
    },
  };
}

async function readClipboard(): Promise<string> {
  try {
    const p = Bun.spawn(["wl-paste", "-n", "-t", "text"], { stdout: "pipe", stderr: "ignore" });
    return await new Response(p.stdout).text();
  } catch {
    return "";
  }
}

function decodeBase64Line(line: string): string {
  try {
    return Buffer.from(line.trim(), "base64").toString("utf8");
  } catch {
    return "";
  }
}

/** Read a byte stream and invoke `onLine` for each newline-terminated record. */
async function consumeLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line) onLine(line);
      }
    }
  } catch {
    /* stream closed */
  }
}
