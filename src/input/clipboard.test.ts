import { expect, test, describe } from "bun:test";
import { parseTranscript, isStopCommand } from "./clipboard.ts";
import { ConfigSchema } from "../config/index.ts";

const config = ConfigSchema.parse({}); // wakeWord defaults to "maya"

describe("wake-word / AWAITING parser", () => {
  test("wake word starts a command and is stripped", () => {
    const r = parseTranscript("Maya, open my GitHub", { awaiting: false, config });
    expect(r.kind).toBe("command");
    expect(r.text).toBe("open my GitHub");
  });

  test("wake word without comma also works", () => {
    expect(parseTranscript("maya open github", { awaiting: false, config }).kind).toBe("command");
  });

  test("non-wake text is ignored in normal mode", () => {
    expect(parseTranscript("just some dictation for another app", { awaiting: false, config }).kind).toBe("ignore");
  });

  test("while awaiting, the next transcript is the answer (no wake word)", () => {
    const r = parseTranscript("the first one please", { awaiting: true, config });
    expect(r.kind).toBe("answer");
    expect(r.text).toBe("the first one please");
  });

  test("empty transcript is ignored", () => {
    expect(parseTranscript("   ", { awaiting: false, config }).kind).toBe("ignore");
    expect(parseTranscript("", { awaiting: true, config }).kind).toBe("ignore");
  });

  test('"Maya, stop" parses to a command whose stripped text is a stop', () => {
    const r = parseTranscript("Maya, stop", { awaiting: false, config });
    expect(r.kind).toBe("command");
    expect(isStopCommand(r.text)).toBe(true);
  });
});

describe("isStopCommand", () => {
  test("matches stop / stop please / Stop now", () => {
    expect(isStopCommand("stop")).toBe(true);
    expect(isStopCommand("stop please")).toBe(true);
    expect(isStopCommand("Stop now")).toBe(true);
    expect(isStopCommand("  stop  ")).toBe(true);
  });

  test("does not match real commands that merely contain 'stop'", () => {
    expect(isStopCommand("open the bus stop page")).toBe(false);
    expect(isStopCommand("stops are scheduled")).toBe(false); // word-boundary: 'stops' != 'stop'
  });
});
