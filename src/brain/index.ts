import { AnthropicBrain } from "./anthropic.ts";
import { GeminiBrain } from "./gemini.ts";
import { OllamaBrain } from "./ollama.ts";
import type { Brain, BrainContext } from "./types.ts";

export type { Brain, BrainContext, StepResult, ToolCall, ToolOutcome } from "./types.ts";

/** Pick the brain provider from config. anthropic = intended, gemini = free demo, ollama = offline. */
export function createBrain(ctx: BrainContext): Brain {
  switch (ctx.config.brain.provider) {
    case "anthropic":
      return new AnthropicBrain(ctx);
    case "gemini":
      return new GeminiBrain(ctx);
    case "ollama":
      return new OllamaBrain(ctx);
  }
}
