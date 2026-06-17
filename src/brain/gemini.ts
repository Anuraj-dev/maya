import type { Config } from "../config/index.ts";
import type { ToolSpec } from "../tools/index.ts";
import type { Brain, BrainContext, StepResult, ToolOutcome } from "./types.ts";

/**
 * Free-demo brain: Google Gemini via the Generative Language REST API (function calling).
 * Get a free key at https://aistudio.google.com/apikey ; set GEMINI_API_KEY (or GOOGLE_API_KEY).
 * No SDK dependency — plain fetch.
 */

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export function geminiApiKey(config: Config): string | undefined {
  return config.geminiApiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
}

function toFunctionDeclarations(tools: ToolSpec[]) {
  return tools.map((t) => {
    const props = (t.inputSchema.properties ?? {}) as Record<string, unknown>;
    const decl: Record<string, unknown> = { name: t.name, description: t.description };
    // Gemini rejects an empty parameters object — omit parameters for no-arg tools.
    if (Object.keys(props).length > 0) decl.parameters = t.inputSchema;
    return decl;
  });
}

export class GeminiBrain implements Brain {
  readonly label: string;
  private contents: GeminiContent[] = [];
  private callCounter = 0;
  private readonly url: string;
  private readonly body: Record<string, unknown>;

  constructor(private ctx: BrainContext) {
    const { gemini } = ctx.config.brain;
    const key = geminiApiKey(ctx.config);
    if (!key) {
      throw new Error(
        "No Gemini API key. Get a free one at https://aistudio.google.com/apikey and set GEMINI_API_KEY.",
      );
    }
    this.label = `Gemini (${gemini.model})`;
    this.url = `${gemini.baseUrl}/v1beta/models/${gemini.model}:generateContent?key=${key}`;
    this.body = {
      systemInstruction: { parts: [{ text: ctx.system }] },
      tools: [{ functionDeclarations: toFunctionDeclarations(ctx.tools) }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    };
  }

  async start(userText: string): Promise<StepResult> {
    this.contents.push({ role: "user", parts: [{ text: userText }] });
    return this.turn();
  }

  async continueWith(results: ToolOutcome[]): Promise<StepResult> {
    this.contents.push({
      role: "user",
      parts: results.map((r) => ({
        functionResponse: { name: r.name, response: { result: r.content, is_error: r.isError } },
      })),
    });
    return this.turn();
  }

  private async turn(): Promise<StepResult> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...this.body, contents: this.contents }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: GeminiContent }[];
    };
    const content = data.candidates?.[0]?.content;
    const parts = content?.parts ?? [];

    // Preserve the model turn in history (verbatim) for the next round.
    this.contents.push({ role: "model", parts });

    let text = "";
    const toolCalls = [];
    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: `gem_${this.callCounter++}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        });
      }
    }
    return { text: text.trim(), toolCalls };
  }
}
