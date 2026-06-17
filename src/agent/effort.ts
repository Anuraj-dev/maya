import type { Config } from "../config/index.ts";

/**
 * Auto-effort controller — budget-aware model/effort selection.
 *
 * Raja is on a $5/month plan, so the policy is:
 *   • Haiku  + no output_config  →  all tasks (fast, cheap)
 *   • Sonnet + low effort        →  explicit coding tasks only
 *
 * No Opus, no high/max effort. When the budget expands or model preferences change,
 * update defaultModel / escalationModel / minEffort / maxEffort in config.json.
 */

export type Effort = "low" | "medium" | "high" | "max";
export type StepKind =
  | "trivial"  // single deterministic action
  | "routine"  // normal navigate/read/click step
  | "planning" // first-turn decomposition
  | "coding";  // explicit code-generation step (escalates to Sonnet low)

export interface BrainChoice {
  model: string;
  effort: Effort | null;
  thinking: { type: "adaptive" } | null;
  escalateAsSubAgent: boolean;
}

export function chooseBrain(kind: StepKind, config: Config): BrainChoice {
  const { defaultModel, escalationModel } = config.brain;

  if (kind === "coding") {
    // Sonnet at low effort for explicit code generation
    return { model: escalationModel, effort: "low", thinking: null, escalateAsSubAgent: false };
  }

  // All other tasks: Haiku, no effort/thinking params (they're not supported on Haiku anyway)
  return { model: defaultModel, effort: null, thinking: null, escalateAsSubAgent: false };
}
