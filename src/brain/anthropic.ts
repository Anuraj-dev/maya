import Anthropic from "@anthropic-ai/sdk";
import { chooseBrain, type StepKind } from "../agent/effort.ts";
import type { Brain, BrainContext, StepResult, ToolOutcome } from "./types.ts";

const CODING_KEYWORDS =
  /\b(code|script|function|class|write\s+a?\s*(python|typescript|javascript|bash|shell|html|css|sql)|program|implement|refactor|debug|fix\s+the\s+(bug|error)|unit\s+test|regex)\b/i;

/**
 * The intended brain: Claude via the Anthropic SDK.
 *
 * Model policy (budget-aware):
 *  - Haiku for all tasks (no output_config / thinking — not supported on Haiku)
 *  - Sonnet at low effort for explicit coding requests
 *
 * Detects coding intent on the first user message to pick the right model for the whole session.
 */
export class AnthropicBrain implements Brain {
  readonly label: string;
  private messages: Anthropic.MessageParam[] = [];
  private client: Anthropic;
  private tools: Anthropic.Tool[];
  private isCodingSession = false;
  private turnIndex = 0;

  constructor(private ctx: BrainContext) {
    const key = ctx.config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "No Anthropic API key. Set ANTHROPIC_API_KEY, or use --provider gemini for a free demo.",
      );
    }
    this.client = new Anthropic({ apiKey: key });
    this.label = `Claude (${ctx.config.brain.defaultModel})`;
    this.tools = ctx.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }

  async start(userText: string): Promise<StepResult> {
    this.isCodingSession = CODING_KEYWORDS.test(userText);
    this.messages.push({ role: "user", content: userText });
    return this.turn();
  }

  async continueWith(results: ToolOutcome[]): Promise<StepResult> {
    this.messages.push({
      role: "user",
      content: results.map<Anthropic.ToolResultBlockParam>((r) => ({
        type: "tool_result",
        tool_use_id: r.id,
        content: r.content,
        is_error: r.isError,
      })),
    });
    return this.turn();
  }

  private async turn(): Promise<StepResult> {
    const kind: StepKind =
      this.turnIndex === 0 && this.isCodingSession ? "coding" : "routine";
    this.turnIndex++;
    const brain = chooseBrain(kind, this.ctx.config);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: brain.model,
      max_tokens: 8192,
      system: this.ctx.system,
      tools: this.tools,
      messages: this.messages,
    };

    if (brain.thinking) (params as Record<string, unknown>).thinking = brain.thinking;
    if (brain.effort) (params as Record<string, unknown>).output_config = { effort: brain.effort };

    const response = await this.client.messages.create(params);
    this.messages.push({ role: "assistant", content: response.content });

    let text = "";
    const toolCalls = [];
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
      }
    }
    return { text: text.trim(), toolCalls };
  }
}
