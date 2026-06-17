import type { ToolSpec } from "../tools/index.ts";
import type { Brain, BrainContext, StepResult, ToolOutcome } from "./types.ts";

/**
 * Offline brain: a local model via Ollama's /api/chat (OpenAI-style tool calling).
 * Requires `ollama serve` running and a tool-capable model pulled (e.g. `ollama pull qwen2.5:3b`).
 * On CPU-only hardware this is slow — prefer Gemini for demos.
 */

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
}

function toOllamaTools(tools: ToolSpec[]) {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

export class OllamaBrain implements Brain {
  readonly label: string;
  private messages: OllamaMessage[];
  private callCounter = 0;
  private readonly url: string;
  private readonly model: string;
  private readonly tools: ReturnType<typeof toOllamaTools>;

  constructor(ctx: BrainContext) {
    const { ollama } = ctx.config.brain;
    this.model = ollama.model;
    this.label = `Ollama (${ollama.model})`;
    this.url = `${ollama.baseUrl}/api/chat`;
    this.tools = toOllamaTools(ctx.tools);
    this.messages = [{ role: "system", content: ctx.system }];
  }

  async start(userText: string): Promise<StepResult> {
    this.messages.push({ role: "user", content: userText });
    return this.turn();
  }

  async continueWith(results: ToolOutcome[]): Promise<StepResult> {
    for (const r of results) this.messages.push({ role: "tool", content: r.content });
    return this.turn();
  }

  private async turn(): Promise<StepResult> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, messages: this.messages, tools: this.tools, stream: false }),
    });
    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    }
    const data = (await res.json()) as { message?: OllamaMessage };
    const msg = data.message ?? { role: "assistant", content: "" };
    this.messages.push(msg);

    const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
      id: `oll_${this.callCounter++}`,
      name: tc.function.name,
      input: tc.function.arguments ?? {},
    }));
    return { text: (msg.content ?? "").trim(), toolCalls };
  }
}
