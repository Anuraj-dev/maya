import type { Config } from "../config/index.ts";
import { undoLast } from "../safety/audit.ts";
import type { MayaTool } from "../tools/index.ts";
import { listenOnce } from "../voice/listen.ts";
import type { TtsBackend } from "../voice/tts.ts";

interface ExtraToolDeps {
  config: Config;
  tts: TtsBackend;
}

export function buildExtraMcpTools({ config, tts }: ExtraToolDeps): MayaTool[] {
  return [
    {
      spec: {
        name: "listen",
        description:
          "Open the microphone and wait for Raja to speak, then return his transcribed words. " +
          "This BLOCKS until he finishes (he presses his push-to-talk key) or it times out. " +
          "This is how you receive his next spoken command — call it, act, speak, then call it again.",
        inputSchema: {
          type: "object",
          properties: {
            openMic: {
              type: "boolean",
              description:
                "Default true: Maya opens the mic for him (hands-free start). Set false to just wait " +
                "for him to start recording himself with his push-to-talk key.",
            },
          },
          required: [],
        },
      },
      execute: async (input) => {
        const openMic = input.openMic !== false;
        const result = await listenOnce(config, { openMic });
        if (result.micUnavailable) {
          return "Microphone unavailable: hyprvox is not installed or not on PATH. Ask Raja to type instead.";
        }
        if (result.transcript) return `Raja said: ${result.transcript}`;
        return "(No speech captured — the mic timed out. Call listen again, or ask Raja if he's there.)";
      },
    },
    {
      spec: {
        name: "speak",
        description:
          "Speak text aloud in Maya's voice — your primary way to reply to Raja. " +
          "Write it to be SPOKEN: warm, concise, natural sentences, no markdown or code blocks.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text Maya should speak aloud." },
          },
          required: ["text"],
        },
      },
      execute: async (input) => {
        const text = String(input.text ?? "").trim();
        if (!text) return "No text provided.";
        await tts.speak(text);
        return `Spoke: "${text}"`;
      },
    },
    {
      spec: {
        name: "undo",
        description:
          "Reverse Maya's most recent reversible action — restore the last file she deleted (from trash) " +
          "or revert the last file she overwrote (from its snapshot). Use when Raja says 'undo that' or " +
          "you made a mistake. Only file_delete and file_write overwrites are reversible.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      execute: async () => undoLast(),
    },
  ];
}
