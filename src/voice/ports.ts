/**
 * Voice broker ports (the "adapter" seam of port-and-adapter, decision W8/W1).
 *
 * The broker logic is provider-neutral. The real, KEY-DEPENDENT pieces — the cloud STT provider
 * (Deepgram / Whisper) and the local wake-word engine (openWakeWord / Porcupine) — implement these
 * interfaces and slot in without touching the orchestration. Until keys arrive, fakes implement
 * them in tests, so the whole turn loop is exercised offline.
 */

/** A chunk of mono PCM audio from the mic. */
export interface AudioFrame {
  /** 16-bit signed PCM samples. */
  pcm: Int16Array;
  sampleRate: number;
}

/** Owns the microphone device and yields a continuous stream of frames. */
export interface AudioSource {
  start(): Promise<void>;
  /** Async iterable of mic frames until stop() is called. */
  frames(): AsyncIterable<AudioFrame>;
  stop(): Promise<void>;
}

/** Local, on-device wake-word engine. Pure-ish: fed frames, returns true the instant "Maya" fires. */
export interface WakeDetector {
  /** Returns true on the frame that completes the wake word. */
  detect(frame: AudioFrame): boolean;
  reset(): void;
}

export type SttEvent =
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string };

/** One open streaming-STT session: push frames in, read transcript events out. */
export interface SttSession {
  push(frame: AudioFrame): void;
  /** Partials, the final transcript (provider endpointing), or an error. */
  events(): AsyncIterable<SttEvent>;
  close(): Promise<void>;
}

/** Opens STT sessions. The Deepgram/Whisper adapter (needs an API key) implements this. */
export interface SttProvider {
  open(): Promise<SttSession>;
}
