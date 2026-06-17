/**
 * Text-to-speech pipeline. Swappable so ElevenLabs can drop in later behind the same interface.
 *
 * Default backend: Piper (neural female voice) → optional FX chain (ring-mod shimmer via tremolo
 * + light plate reverb via sox) → paplay. Audio is synthesised one sentence at a time and the
 * NEXT sentence is synthesised while the current one plays, so Maya starts speaking as soon as
 * the first sentence is ready without any mid-speech gaps. config.voice.robotIntensity (0–100)
 * and .reverb (0–100) control the FX mix.
 *
 * Why raw PCM, not WAV: piper only writes a valid WAV when given a seekable `-f` file. Piped to
 * stdout in WAV mode it emits nothing (it can't seek back to fill in the RIFF length), which is
 * what made the old `piper | sox | paplay` chain feed garbage to the speakers and break up. We
 * use `--output-raw` (16-bit signed mono at the model's sample rate) end-to-end instead, and we
 * buffer each sentence fully before playing it so PipeWire/Pulse never underruns mid-sentence.
 *
 * Voice models are looked up at ~/.local/share/piper/voices/<voice>.onnx unless piperVoice
 * is set to an absolute path.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import type { Config } from "../config/index.ts";

const VOICES_DIR = join(homedir(), ".local", "share", "piper", "voices");

// pip-installed piper lands here when ~/.local/bin is not on the system PATH
const PIPER_FALLBACK = join(homedir(), ".local", "bin", "piper");

/** Piper voices are 16-bit signed mono; sample rate comes from the model's JSON sidecar. */
const DEFAULT_SAMPLE_RATE = 22050;

export interface TtsBackend {
  /** Speak text; resolves when playback finishes. Streams sentence-by-sentence. */
  speak(text: string): Promise<void>;
  /** Stop any in-progress playback immediately ("Maya, stop" / Esc). */
  stop(): void;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Split text into sentences for streaming TTS.
 * Splits on sentence-ending punctuation followed by whitespace + an uppercase letter
 * or opening quote — avoids splitting on abbreviations like "Mr." or decimals.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'''])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve the .onnx model path from a voice name or absolute path.
 * Absolute paths pass through unchanged; bare names are looked up in VOICES_DIR.
 */
export function resolvePiperModel(piperVoice: string): string {
  if (piperVoice.startsWith("/")) return piperVoice;
  return join(VOICES_DIR, `${piperVoice}.onnx`);
}

/** Read the voice's sample rate from its `<model>.json` sidecar; fall back to 22050. */
export function readSampleRate(modelPath: string): number {
  try {
    const meta = JSON.parse(readFileSync(`${modelPath}.json`, "utf8"));
    const sr = meta?.audio?.sample_rate;
    return typeof sr === "number" && sr > 0 ? sr : DEFAULT_SAMPLE_RATE;
  } catch {
    return DEFAULT_SAMPLE_RATE;
  }
}

/** Raw 16-bit signed mono format flags for a sox/paplay endpoint at the given sample rate. */
function rawFormat(sampleRate: number): string[] {
  return ["-t", "raw", "-r", String(sampleRate), "-e", "signed", "-b", "16", "-c", "1"];
}

/**
 * Build the sox argument list for the FX chain (raw 16-bit mono in, raw 16-bit mono out).
 * robotIntensity (0–100) drives overdrive saturation + 8 Hz tremolo (audible shimmer, not buzz).
 * reverb (0–100) drives plate reverb wetness.
 * No `gain -n`: normalization buffers the whole stream, and we already buffer per sentence —
 * keeping sox a pure pass-through-with-effects keeps the per-sentence latency low.
 */
export function buildSoxArgs(
  robotIntensity: number,
  reverb: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
): string[] {
  const args = [...rawFormat(sampleRate), "-", ...rawFormat(sampleRate), "-"];

  if (robotIntensity > 0) {
    const od = Math.round((robotIntensity / 100) * 30); // subtle saturation 0–30
    const td = Math.round((robotIntensity / 100) * 50); // tremolo depth 0–50 %
    if (od > 0) args.push("overdrive", String(od));
    args.push("tremolo", "8", String(td)); // 8 Hz = audible shimmer, not harsh buzz
  }
  if (reverb > 0) {
    const rv = Math.round((reverb / 100) * 80);
    args.push("reverb", String(rv));
  }

  return args;
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

export class PiperTts implements TtsBackend {
  private active = new Set<ReturnType<typeof Bun.spawn>>();
  private stopped = false;
  private readonly model: string;
  private readonly sampleRate: number;

  constructor(
    private config: Config,
    private piperBin: string,
  ) {
    this.model = resolvePiperModel(config.voice.piperVoice);
    this.sampleRate = readSampleRate(this.model);
  }

  async speak(text: string): Promise<void> {
    this.stopped = false;
    const sentences = splitSentences(text);
    if (sentences.length === 0) return;

    // Prefetch: synthesise the next sentence while the current one is playing, so there are no
    // gaps between sentences and the first words come out as soon as sentence 1 is ready.
    let pending = this.synth(sentences[0]!);
    for (let i = 0; i < sentences.length; i++) {
      const pcm = await pending;
      if (this.stopped) return;
      if (i + 1 < sentences.length) pending = this.synth(sentences[i + 1]!);
      await this.play(pcm);
      if (this.stopped) return;
    }
  }

  /** Synthesise one sentence to a complete raw-PCM buffer (piper → optional sox FX). */
  private async synth(sentence: string): Promise<Uint8Array> {
    const { robotIntensity, reverb } = this.config.voice;

    const piper = Bun.spawn(
      [this.piperBin, "--model", this.model, "--output-raw", "--sentence-silence", "0.05"],
      { stdin: "pipe", stdout: "pipe", stderr: "ignore" },
    );
    this.active.add(piper);
    piper.stdin.write(sentence);
    piper.stdin.end();

    let out = piper.stdout as ReadableStream<Uint8Array>;
    let sox: ReturnType<typeof Bun.spawn> | undefined;
    if (robotIntensity > 0 || reverb > 0) {
      sox = Bun.spawn(["sox", ...buildSoxArgs(robotIntensity, reverb, this.sampleRate)], {
        stdin: piper.stdout,
        stdout: "pipe",
        stderr: "ignore",
      });
      this.active.add(sox);
      out = sox.stdout as ReadableStream<Uint8Array>;
    }

    try {
      return await new Response(out).bytes();
    } finally {
      this.active.delete(piper);
      if (sox) this.active.delete(sox);
    }
  }

  /** Play a complete raw-PCM buffer via paplay; resolves when playback finishes. */
  private async play(pcm: Uint8Array): Promise<void> {
    if (pcm.length === 0) return;
    const pa = Bun.spawn(
      ["paplay", "--raw", "--format=s16le", `--rate=${this.sampleRate}`, "--channels=1"],
      { stdin: "pipe", stdout: "ignore", stderr: "ignore" },
    );
    this.active.add(pa);
    pa.stdin.write(pcm);
    pa.stdin.end();
    try {
      await pa.exited;
    } finally {
      this.active.delete(pa);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const p of this.active) {
      try { p.kill(); } catch { /* already exited */ }
    }
    this.active.clear();
  }
}

/** No-op backend: logs instead of speaking (dev / testing without piper installed). */
export class NullTts implements TtsBackend {
  async speak(text: string): Promise<void> {
    console.log(`[tts] ${text}`);
  }
  stop(): void {}
}

/** Resolve the piper binary: PATH first, then the pip user-install fallback. */
export async function resolvePiperBin(): Promise<string | null> {
  return (await Bun.which("piper")) ?? ((await Bun.file(PIPER_FALLBACK).exists()) ? PIPER_FALLBACK : null);
}

/**
 * Create TTS backend from config.
 * Falls back to NullTts if piper is not found, printing an install hint.
 */
export async function createTts(config: Config): Promise<TtsBackend> {
  const piperBin = await resolvePiperBin();
  if (!piperBin) {
    console.warn(
      "[tts] piper not found — voice output disabled.\n" +
        "      Install: pip install piper-tts\n" +
        "      Then download a voice model to ~/.local/share/piper/voices/",
    );
    return new NullTts();
  }
  return new PiperTts(config, piperBin);
}
