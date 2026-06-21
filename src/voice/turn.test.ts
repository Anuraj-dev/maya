import { expect, test, describe } from "bun:test";
import { initialTurn, reduceTurn, isTerminal, type TurnState, type TurnEvent } from "./turn.ts";

const cfg = { maxListenMs: 10_000 };

/** Drive a sequence of events through the reducer from the initial state. */
function run(events: TurnEvent[]): TurnState {
  return events.reduce((s, e) => reduceTurn(s, e, cfg), initialTurn());
}

describe("voice turn — happy path (W1)", () => {
  test("wake → final yields the transcript", () => {
    const s = run([
      { type: "wake", at: 1000 },
      { type: "partial", text: "what's the" },
      { type: "final", text: "what's the weather" },
    ]);
    expect(s.phase).toBe("transcript");
    expect(s.transcript).toBe("what's the weather");
    expect(isTerminal(s)).toBe(true);
  });

  test("partials update live state but don't terminate", () => {
    const s = run([{ type: "wake", at: 0 }, { type: "partial", text: "hello" }]);
    expect(s.phase).toBe("listening");
    expect(s.partial).toBe("hello");
    expect(isTerminal(s)).toBe(false);
  });

  test("a final before any wake is ignored (no spurious transcript)", () => {
    const s = run([{ type: "final", text: "ghost" }]);
    expect(s.phase).toBe("waiting_wake");
  });
});

describe("watchdog (W1.4)", () => {
  test("times out when the cap is reached with no final", () => {
    const s = run([
      { type: "wake", at: 1000 },
      { type: "tick", at: 1000 + 9000 }, // under cap
      { type: "tick", at: 1000 + 10_000 }, // at cap
    ]);
    expect(s.phase).toBe("timed_out");
  });

  test("a final that lands before the cap wins over the watchdog", () => {
    const s = run([
      { type: "wake", at: 0 },
      { type: "final", text: "done in time" },
      { type: "tick", at: 999_999 }, // ignored: already terminal
    ]);
    expect(s.phase).toBe("transcript");
    expect(s.transcript).toBe("done in time");
  });

  test("ticks while merely waiting for wake never time out", () => {
    const s = run([{ type: "tick", at: 1 }, { type: "tick", at: 10_000_000 }]);
    expect(s.phase).toBe("waiting_wake");
  });
});

describe("graceful degrade (W1.4)", () => {
  test("a socket/STT error ends the turn in error, not a wedge", () => {
    const s = run([{ type: "wake", at: 0 }, { type: "error", message: "websocket closed" }]);
    expect(s.phase).toBe("error");
    expect(s.error).toBe("websocket closed");
    expect(isTerminal(s)).toBe(true);
  });
});

describe("proactivity — event wakes the brain (W2)", () => {
  test("a queued event while waiting becomes the turn outcome", () => {
    const s = run([{ type: "queued_event", payload: "build #3 finished" }]);
    expect(s.phase).toBe("event");
    expect(s.event).toBe("build #3 finished");
  });

  test("an event does NOT hijack an in-progress utterance", () => {
    const s = run([
      { type: "wake", at: 0 },
      { type: "queued_event", payload: "meeting in 5" },
      { type: "final", text: "remind me to call mom" },
    ]);
    expect(s.phase).toBe("transcript");
    expect(s.transcript).toBe("remind me to call mom");
  });
});

describe("barge-in (W3)", () => {
  test("interrupt cancels a listening turn", () => {
    const s = run([{ type: "wake", at: 0 }, { type: "interrupt" }]);
    expect(s.phase).toBe("interrupted");
  });

  test("interrupt while waiting also cancels cleanly", () => {
    const s = run([{ type: "interrupt" }]);
    expect(s.phase).toBe("interrupted");
  });

  test("events after a terminal phase are ignored (turn is frozen)", () => {
    const s = run([
      { type: "wake", at: 0 },
      { type: "final", text: "first" },
      { type: "final", text: "second" },
      { type: "interrupt" },
    ]);
    expect(s.phase).toBe("transcript");
    expect(s.transcript).toBe("first");
  });
});
