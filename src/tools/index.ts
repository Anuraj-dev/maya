import type { Config } from "../config/index.ts";
import { browserTools } from "./browser.ts";
import { voiceTools, type VoiceDeps } from "./voice.ts";
import { shellTools } from "./shell.ts";
import { fileTools } from "./file.ts";
import { appTools } from "./app.ts";
import { vaultTools } from "./vault.ts";
import { memoryTools } from "./memory.ts";

/**
 * Dedicated, typed tool registry. Each tool is a gateable, action-specific hook
 * (NOT a single raw bash blob) so safety/floor.ts can classify and the overlay can render it.
 * Tool names use underscores (provider tool-name rules: [a-zA-Z0-9_-]).
 *
 * The spec is provider-NEUTRAL (plain JSON Schema); each brain provider formats it for its
 * own API (Anthropic input_schema, Gemini function_declarations, Ollama function params).
 */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema object: { type: "object", properties, required } */
  inputSchema: Record<string, unknown>;
}

export interface MayaTool<I = Record<string, unknown>> {
  spec: ToolSpec;
  execute: (input: I) => Promise<string>;
}

/** Capabilities the daemon injects into tools (voice asking, etc.). Empty for headless runs. */
export type ToolDeps = VoiceDeps;

/** Build the active tool set for a run. voice_ask is included only when an asker is wired. */
export function buildTools(config: Config, deps: ToolDeps = {}): Record<string, MayaTool> {
  return {
    ...browserTools(config),
    ...voiceTools(deps),
    ...shellTools,
    ...fileTools,
    ...appTools,
    ...vaultTools,
    ...memoryTools,
  };
}

export function toolSpecs(tools: Record<string, MayaTool>): ToolSpec[] {
  return Object.values(tools).map((t) => t.spec);
}
