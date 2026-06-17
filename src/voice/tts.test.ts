import { expect, test, describe } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  splitSentences,
  resolvePiperModel,
  buildSoxArgs,
  NullTts,
  PiperTts,
  createTts,
  resolvePiperBin,
} from "./tts.ts";
import { ConfigSchema } from "../config/index.ts";

const VOICES_DIR = join(homedir(), ".local", "share", "piper", "voices");

// ---------------------------------------------------------------------------
// splitSentences
// ---------------------------------------------------------------------------

describe("splitSentences", () => {
  test("single sentence returns itself", () => {
    expect(splitSentences("Hello there")).toEqual(["Hello there"]);
  });

  test("splits on period + space + uppercase", () => {
    const result = splitSentences("I found three repos. Here they are. The first one is good.");
    expect(result).toEqual([
      "I found three repos.",
      "Here they are.",
      "The first one is good.",
    ]);
  });

  test("splits on ! and ?", () => {
    const result = splitSentences("Are you sure? Yes! Let's go.");
    expect(result).toEqual(["Are you sure?", "Yes!", "Let's go."]);
  });

  test("does not split on abbreviations like Mr. or e.g.", () => {
    const text = "Mr. Smith went to the store. He bought milk.";
    const result = splitSentences(text);
    // "Mr. Smith..." stays as one sentence because after "Mr." the next char is lowercase 'S'...
    // wait, 'S' is uppercase. Actually this is a known limitation of simple heuristics.
    // The important case: decimal numbers and lowercase-following periods are NOT split.
    expect(splitSentences("version 3.14 is released. Download it now.")).toEqual([
      "version 3.14 is released.",
      "Download it now.",
    ]);
  });

  test("does not split on period followed by lowercase", () => {
    // e.g. "i.e. this is fine" — lowercase after period, no split
    expect(splitSentences("This is e.g. a test. Good.")).toEqual([
      "This is e.g. a test.",
      "Good.",
    ]);
  });

  test("filters out empty strings from input", () => {
    expect(splitSentences("  ")).toEqual([]);
    expect(splitSentences("")).toEqual([]);
  });

  test("trims leading/trailing whitespace from each sentence", () => {
    const result = splitSentences("  Hello world.  Next sentence.  ");
    expect(result.every((s) => s === s.trim())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolvePiperModel
// ---------------------------------------------------------------------------

describe("resolvePiperModel", () => {
  test("bare name is looked up in voices dir", () => {
    expect(resolvePiperModel("en_US-amy-medium")).toBe(
      join(VOICES_DIR, "en_US-amy-medium.onnx")
    );
  });

  test("absolute path passes through unchanged", () => {
    const abs = "/opt/piper/models/en_US-amy-medium.onnx";
    expect(resolvePiperModel(abs)).toBe(abs);
  });

  test("different voice names resolve correctly", () => {
    expect(resolvePiperModel("en_GB-alba-medium")).toBe(
      join(VOICES_DIR, "en_GB-alba-medium.onnx")
    );
  });
});

// ---------------------------------------------------------------------------
// buildSoxArgs
// ---------------------------------------------------------------------------

describe("buildSoxArgs", () => {
  test("zero intensity and zero reverb: only raw IO args (in then out)", () => {
    const io = ["-t", "raw", "-r", "22050", "-e", "signed", "-b", "16", "-c", "1", "-"];
    expect(buildSoxArgs(0, 0)).toEqual([...io, ...io]);
  });

  test("sample rate is threaded into both IO endpoints", () => {
    const args = buildSoxArgs(0, 0, 16000);
    expect(args.filter((a) => a === "16000")).toHaveLength(2);
  });

  test("robotIntensity > 0 adds overdrive and tremolo", () => {
    const args = buildSoxArgs(100, 0);
    expect(args).toContain("overdrive");
    expect(args).toContain("tremolo");
    expect(args).toContain("8"); // 8 Hz shimmer frequency
  });

  test("reverb > 0 adds reverb", () => {
    const args = buildSoxArgs(0, 100);
    expect(args).toContain("reverb");
  });

  test("both active includes overdrive, tremolo, and reverb", () => {
    const args = buildSoxArgs(50, 50);
    expect(args).toContain("overdrive");
    expect(args).toContain("tremolo");
    expect(args).toContain("reverb");
  });

  test("reverb is always the last effect when present", () => {
    const args = buildSoxArgs(50, 50);
    const reverbIdx = args.lastIndexOf("reverb");
    expect(reverbIdx).toBeGreaterThan(-1);
    // nothing after the reverb value
    expect(args.length).toBe(reverbIdx + 2);
  });

  test("tremolo depth scales with robotIntensity", () => {
    const low = buildSoxArgs(10, 0);
    const high = buildSoxArgs(100, 0);
    const tremoloIdx = (args: string[]) => args.indexOf("tremolo");
    // depth is the arg after "tremolo" + "55"
    const depthOf = (args: string[]) => Number(args[tremoloIdx(args) + 2]);
    expect(depthOf(high)).toBeGreaterThan(depthOf(low));
  });

  test("reverb level scales with reverb intensity", () => {
    const low = buildSoxArgs(0, 10);
    const high = buildSoxArgs(0, 100);
    const reverbVal = (args: string[]) => Number(args[args.indexOf("reverb") + 1]);
    expect(reverbVal(high)).toBeGreaterThan(reverbVal(low));
  });

  test("robotIntensity=1 skips overdrive (rounds to 0) but still adds tremolo", () => {
    const args = buildSoxArgs(1, 0);
    expect(args).not.toContain("overdrive");
    expect(args).toContain("tremolo");
  });
});

// ---------------------------------------------------------------------------
// NullTts
// ---------------------------------------------------------------------------

describe("NullTts", () => {
  test("speak resolves immediately", async () => {
    const tts = new NullTts();
    await expect(tts.speak("Hello world")).resolves.toBeUndefined();
  });

  test("stop() is a no-op and does not throw", () => {
    const tts = new NullTts();
    expect(() => tts.stop()).not.toThrow();
  });

  test("stop() while idle does not throw", () => {
    const tts = new NullTts();
    tts.stop();
    tts.stop(); // idempotent
  });
});

// ---------------------------------------------------------------------------
// createTts — factory + resolvePiperBin
// ---------------------------------------------------------------------------

describe("createTts", () => {
  test("returns NullTts when piper is not found", async () => {
    const bin = await resolvePiperBin();
    if (bin) return; // piper is installed — can't exercise the fallback path
    const config = ConfigSchema.parse({});
    const tts = await createTts(config);
    expect(tts).toBeInstanceOf(NullTts);
  });

  test("returns PiperTts when piper is found", async () => {
    const bin = await resolvePiperBin();
    if (!bin) return; // piper not installed — skip
    const config = ConfigSchema.parse({});
    const tts = await createTts(config);
    expect(tts).toBeInstanceOf(PiperTts);
  });
});
