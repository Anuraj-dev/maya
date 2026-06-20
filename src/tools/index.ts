import type { Config } from "../config/index.ts";
import { browserTools } from "./browser.ts";
import { voiceTools, type VoiceDeps } from "./voice.ts";
import { shellTools } from "./shell.ts";
import { fileTools } from "./file.ts";
import { appTools } from "./app.ts";
import { vaultTools } from "./vault.ts";
import { memoryTools } from "./memory.ts";
import { sensingTools } from "./sensing.ts";
import { proactiveTools, type ProactiveDeps } from "./proactive.ts";
import { processTools, type ProcessDeps } from "./process.ts";

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
  /**
   * When true, a SUCCESSFUL execute() returns a filesystem path to an image. Front-ends that
   * can carry images (the MCP server) read the file and return it as an image content block so
   * the brain can actually SEE it; text-only callers just get the path. Error results (which
   * aren't valid paths) fall back to text either way.
   */
  returnsImage?: boolean;
}

/** Capabilities the daemon injects into tools (voice asking, reminders, processes, etc.). Empty for headless runs. */
export type ToolDeps = VoiceDeps & ProactiveDeps & ProcessDeps;

/**
 * Build the active tool set for a run. Dependency-gated tools (voice_ask, remind/reminders_*)
 * are included only when their capability is wired in.
 */
export function buildTools(config: Config, deps: ToolDeps = {}): Record<string, MayaTool> {
  return {
    ...browserTools(config),
    ...voiceTools(deps),
    ...shellTools,
    ...fileTools,
    ...appTools,
    ...vaultTools,
    ...memoryTools,
    ...sensingTools,
    ...proactiveTools(deps),
    ...processTools(deps),
  };
}

export function toolSpecs(tools: Record<string, MayaTool>): ToolSpec[] {
  return Object.values(tools).map((t) => t.spec);
}
