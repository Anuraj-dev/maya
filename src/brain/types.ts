import type { Config } from "../config/index.ts";
import type { ToolSpec } from "../tools/index.ts";

/** A model's request to run a tool. `id` is provider-assigned or synthesized. */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** The result of running a tool, fed back to the model. */
export interface ToolOutcome {
  id: string;
  name: string;
  content: string;
  isError: boolean;
}

/** One model turn: any text it produced + any tools it wants to run. */
export interface StepResult {
  text: string;
  toolCalls: ToolCall[];
}

export interface BrainContext {
  system: string;
  tools: ToolSpec[];
  config: Config;
}

/**
 * A stateful conversation with a model provider. Each provider keeps its own message
 * history in its own format, so the agent loop stays provider-agnostic. Swap providers
 * (Claude / Gemini / Ollama) without touching the loop, tools, or safety floor.
 */
export interface Brain {
  /** Human-facing label, e.g. "Gemini (gemini-2.0-flash)". */
  readonly label: string;
  /** Send the user's command; returns the model's first turn. */
  start(userText: string): Promise<StepResult>;
  /** Send tool results back; returns the model's next turn. */
  continueWith(results: ToolOutcome[]): Promise<StepResult>;
}
