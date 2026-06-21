/**
 * Voice-turn state machine — the deterministic core of Maya's owned capture loop.
 *
 * This replaces the hyprvox/clipboard listen path (production decisions W1, W1.4, W2, W3). The
 * audio broker feeds raw signals (wake fired, partial/final transcript, a watchdog tick, a socket
 * error, a queued proactivity event, a barge-in interrupt); this pure reducer turns them into a
 * turn outcome the MCP `listen()` tool returns to the brain. No mic, no network, no timers here —
 * the broker owns the I/O; this owns the *logic*, so it is fully unit-testable (see turn.test.ts).
 *
 * Outcomes the brain acts on:
 *   transcript  — Raja spoke; `transcript` holds his words
 *   event       — a proactivity stimulus fired while waiting (e.g. "build #3 finished")
 *   timed_out   — watchdog cap hit with no final transcript → broker should speak "say that again"
 *   error       — STT/socket failure → graceful degrade, never a wedge
 *   interrupted — barge-in: Raja said the wake word again to cut Maya off
 */

export type TurnPhase = "waiting_wake" | "listening" | "transcript" | "event" | "timed_out" | "error" | "interrupted";

export interface TurnState {
  phase: TurnPhase;
  /** Final transcript once phase === "transcript". */
  transcript?: string;
  /** Latest partial (UI/overlay can show it live); not the final answer. */
  partial?: string;
  /** Proactivity payload once phase === "event". */
  event?: string;
  /** Error message once phase === "error". */
  error?: string;
  /** Epoch ms the mic opened (set on wake); drives the watchdog. */
  openedAt?: number;
}

export type TurnEvent =
  | { type: "wake"; at: number }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "tick"; at: number }
  | { type: "queued_event"; payload: string }
  | { type: "error"; message: string }
  | { type: "interrupt" };

export interface TurnConfig {
  /** Hard ceiling on a single listen turn — the watchdog that stops provider-endpointing wedges. */
  maxListenMs: number;
}

const TERMINAL: ReadonlySet<TurnPhase> = new Set(["transcript", "event", "timed_out", "error", "interrupted"]);

export function initialTurn(): TurnState {
  return { phase: "waiting_wake" };
}

export function isTerminal(state: TurnState): boolean {
  return TERMINAL.has(state.phase);
}

/**
 * Advance the turn by one broker signal. Once a turn reaches a terminal phase it is frozen —
 * further events are ignored (the caller starts a fresh turn for the next listen()).
 */
export function reduceTurn(state: TurnState, event: TurnEvent, cfg: TurnConfig): TurnState {
  if (isTerminal(state)) return state;

  switch (event.type) {
    // Barge-in beats everything: saying the wake word again cancels the current turn.
    case "interrupt":
      return { ...state, phase: "interrupted" };

    case "error":
      return { ...state, phase: "error", error: event.message };

    // A proactivity stimulus only wins while we're still waiting for Raja to speak — once he has
    // started talking (listening) we don't let an event hijack his in-progress utterance.
    case "queued_event":
      if (state.phase === "waiting_wake") return { ...state, phase: "event", event: event.payload };
      return state;

    case "wake":
      if (state.phase === "waiting_wake") return { ...state, phase: "listening", openedAt: event.at };
      return state; // already listening; ignore a duplicate wake

    case "partial":
      if (state.phase === "listening") return { ...state, partial: event.text };
      return state;

    case "final":
      if (state.phase === "listening") return { ...state, phase: "transcript", transcript: event.text };
      return state;

    case "tick": {
      // Watchdog: only meaningful once the mic is open. Caps the turn so a provider that never
      // sends a final (dropped socket, dead air) can't freeze Maya forever.
      if (state.phase === "listening" && state.openedAt !== undefined) {
        if (event.at - state.openedAt >= cfg.maxListenMs) return { ...state, phase: "timed_out" };
      }
      return state;
    }

    default:
      return state;
  }
}
