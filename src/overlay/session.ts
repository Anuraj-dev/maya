import type { MayaSink } from "../agent/loop.ts";
import type { TtsBackend } from "../voice/tts.ts";
import type { OverlayBridge, Snapshot, MayaState } from "./bridge.ts";

/**
 * Turns agent-loop events into overlay snapshots and broadcasts them over the bridge.
 *
 * Two callers:
 *  - `maya live` passes no options: captions only, no audio, no mic (pure visual preview).
 *  - the daemon passes { tts, listen }: say() also speaks aloud, and `voiceAsk` speaks a
 *    question then opens the mic and waits for the spoken answer (drives the AWAITING state).
 */

const LABELS: Record<string, string> = {
  browser_navigate: "Open page",
  browser_read: "Read page",
  browser_click: "Click",
  browser_type: "Type",
  browser_screenshot: "Screenshot",
  voice_ask: "Ask you",
};

function label(name: string): string {
  return LABELS[name] ?? name.replace(/_/g, " ");
}

function detail(input: Record<string, unknown>): string | undefined {
  const v = input.url ?? input.text ?? input.selector ?? input.query ?? input.path ?? input.question;
  if (typeof v !== "string") return undefined;
  return v.length > 44 ? `${v.slice(0, 44)}…` : v;
}

export interface SessionOptions {
  /** When set, say() speaks aloud via this backend (daemon). Omitted for the silent preview. */
  tts?: TtsBackend;
  /** When set, voice_ask is available: open the mic and resolve with the user's spoken answer. */
  listen?: (question: string) => Promise<string>;
}

export interface LiveSession {
  sink: MayaSink;
  /** Speak a question, switch to listening, await the spoken answer. Wired into voice_ask. */
  voiceAsk?: (question: string) => Promise<string>;
  /** Force a state/caption (e.g. error or idle on shutdown). */
  set(state: MayaState, caption?: string): void;
}

export function createLiveSession(bridge: OverlayBridge, opts: SessionOptions = {}): LiveSession {
  const snap: Snapshot = { state: "idle", caption: "", tasks: [] };
  const push = () => bridge.broadcast({ ...snap, tasks: snap.tasks.map((t) => ({ ...t })) });

  const sink: MayaSink = {
    thinking() {
      snap.state = "thinking";
      push();
    },
    async say(text) {
      snap.state = "speaking";
      snap.caption = text;
      push();
      await opts.tts?.speak(text);
    },
    toolStart(id, name, input) {
      snap.state = "acting";
      snap.tasks.push({ id, label: label(name), detail: detail(input), status: "running" });
      push();
    },
    toolEnd(id, status) {
      const t = snap.tasks.find((task) => task.id === id);
      if (t) t.status = status;
      push();
    },
    async confirm(_name, reason, category) {
      snap.state = "awaiting";
      snap.confirmation = { prompt: reason, category };
      push();
      const approved = await bridge.requestConfirmation();
      snap.confirmation = undefined;
      snap.state = "acting";
      push();
      return approved;
    },
    idle() {
      snap.state = "idle";
      push();
    },
    error(message) {
      snap.state = "error";
      snap.caption = message;
      push();
    },
  };

  const voiceAsk = opts.listen
    ? async (question: string): Promise<string> => {
        // Speak the question first (so Maya finishes talking before the mic opens), then listen.
        snap.state = "speaking";
        snap.caption = question;
        push();
        await opts.tts?.speak(question);

        snap.state = "listening";
        push();
        const answer = await opts.listen!(question);

        snap.state = "thinking";
        push();
        return answer;
      }
    : undefined;

  return {
    sink,
    voiceAsk,
    set(state, caption) {
      snap.state = state;
      if (caption !== undefined) snap.caption = caption;
      if (state === "idle") {
        snap.tasks = [];
        snap.confirmation = undefined;
      }
      push();
    },
  };
}
