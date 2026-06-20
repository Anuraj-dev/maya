import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

/**
 * All Maya runtime state lives here (mirrors hyprvox's ~/.config/hypr/vox).
 * Override with MAYA_DIR for tests or a second profile.
 */
export const MAYA_DIR = process.env.MAYA_DIR || join(homedir(), ".config", "maya");
export const CONFIG_PATH = join(MAYA_DIR, "config.json");
export const SOCKET_PATH = join(MAYA_DIR, "daemon.sock");
export const PID_PATH = join(MAYA_DIR, "overlay.pid");
export const BROWSER_PROFILE_DIR = join(MAYA_DIR, "browser");

export const ConfigSchema = z.object({
  /** API keys. Prefer the matching env var; these are fallbacks. */
  anthropicApiKey: z.string().optional(), // or ANTHROPIC_API_KEY
  geminiApiKey: z.string().optional(), // or GEMINI_API_KEY / GOOGLE_API_KEY

  brain: z
    .object({
      /**
       * "anthropic" = intended brain (Claude).
       * "gemini" = free demo brain (Google AI Studio free tier).
       * "ollama" = offline local model.
       */
      provider: z.enum(["anthropic", "gemini", "ollama"]).default("anthropic"),
      /** Haiku drives all tasks; Sonnet (low effort) is used only for explicit coding requests. */
      defaultModel: z.string().default("claude-haiku-4-5-20251001"),
      /** Coding-only escalation. No Opus — stays affordable on a $5/month plan. */
      escalationModel: z.string().default("claude-sonnet-4-6"),
      gemini: z
        .object({
          model: z.string().default("gemini-2.0-flash"),
          baseUrl: z.string().default("https://generativelanguage.googleapis.com"),
        })
        .prefault({}),
      ollama: z
        .object({
          baseUrl: z.string().default("http://127.0.0.1:11434"),
          model: z.string().default("qwen2.5:3b"),
        })
        .prefault({}),
    })
    .prefault({}),

  voice: z
    .object({
      /** Piper voice model name, e.g. "en_US-amy-medium". */
      piperVoice: z.string().default("en_US-amy-medium"),
      /** 0–100; FX mix for the ring-mod/formant shimmer ("robot" character). */
      robotIntensity: z.number().min(0).max(100).default(18),
      reverb: z.number().min(0).max(100).default(12),
    })
    .prefault({}),

  input: z
    .object({
      wakeWord: z.string().default("maya"),
      /** ms to keep listening for a follow-up after Maya finishes (fallback path). */
      followUpWindowMs: z.number().default(10_000),
      /** Hard cap on a single hands-free recording; force `hyprvox stop` if silence-stop misfires. */
      maxListenMs: z.number().default(15_000),
    })
    .prefault({}),

  browser: z
    .object({
      headless: z.boolean().default(false),
      profileDir: z.string().default(BROWSER_PROFILE_DIR),
    })
    .prefault({}),
}).prefault({});

export type Config = z.infer<typeof ConfigSchema>;

/** Categories that ALWAYS require confirmation — enforced in safety/floor.ts. */
export const IRREVERSIBLE_CATEGORIES = [
  "file_delete",
  "file_overwrite",
  "shell_sudo_or_install",
  "payment",
  "send_or_publish",
] as const;
export type IrreversibleCategory = (typeof IRREVERSIBLE_CATEGORIES)[number];

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) return ConfigSchema.parse({});
  return ConfigSchema.parse(await file.json());
}
