/**
 * voice_ask — Maya asks the user a free-form question out loud and gets their spoken answer.
 *
 * The actual mechanics (speak the question, open the mic via hyprvox, capture the next
 * transcript) live in the daemon; this tool is a thin, typed front for them so the agent loop
 * and the irreversible floor treat asking like any other gated action. When no asker is wired
 * (e.g. the terminal `ask` entry point), the tool is simply not registered.
 */
import type { MayaTool } from "./index.ts";

export interface VoiceDeps {
  /** Speak the question, open the mic, and resolve with the user's spoken answer ("" if none). */
  voiceAsk?: (question: string) => Promise<string>;
}

export function voiceTools(deps: VoiceDeps): Record<string, MayaTool> {
  const ask = deps.voiceAsk;
  if (!ask) return {};

  return {
    voice_ask: {
      spec: {
        name: "voice_ask",
        description:
          "Ask the user a free-form question out loud and get their spoken answer back. The mic " +
          "opens automatically and stops when they finish speaking. Use this for clarifications " +
          "or open-ended input. Do NOT use it for yes/no confirmations of irreversible actions — " +
          "those are gated automatically.",
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The question to ask, phrased to be spoken aloud (warm, concise, no markdown).",
            },
          },
          required: ["question"],
        },
      },
      execute: async (input) => {
        const question = String(input.question ?? "").trim();
        if (!question) return "No question text provided.";
        const answer = (await ask(question)).trim();
        return answer
          ? `The user said: ${answer}`
          : "No answer was captured (the user may not have spoken, or the mic timed out). Proceed with a sensible default or ask again.";
      },
    },
  };
}
