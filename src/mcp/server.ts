/**
 * Maya MCP server — exposes Maya's body (shell, file, browser, sensing, voice, memory…) as MCP
 * tools over stdio so an external coding agent (Claude Code, Codex, …) can be Maya's BRAIN.
 *
 * Architecture: the agent is the brain. Maya is the body — she senses the machine, acts on it,
 * speaks, and listens. No LLM API calls happen in this server. The intended loop is:
 *
 *     listen()  →  agent reasons  →  act via tools  →  speak()  →  listen()  →  …
 *
 * Safety model (audit + undo, NOT a gate): every call is logged to ~/.config/maya/audit/log.jsonl;
 * destructive file ops are reversible (file_delete → trash, file_write → snapshot) via the `undo`
 * tool. The only hard gate left is payments — which the agent must opt into with confirm:true,
 * since a charge is neither logged-away nor undoable.
 *
 * Usage:  maya mcp          (runs until killed — the agent connects over stdio)
 */

import { existsSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { join } from "node:path";

import { loadConfig, MAYA_DIR } from "../config/index.ts";
import { buildTools, type MayaTool } from "../tools/index.ts";
import { runTool } from "../core/run-tool.ts";
import { undoLast, runRetention } from "../safety/audit.ts";
import { createTts } from "../voice/tts.ts";
import { listenOnce } from "../voice/listen.ts";
import { sendNotification } from "../tools/proactive.ts";
import { createReminderService, type Reminder } from "../proactive/reminders.ts";
import { createProcessManager } from "../system/processes.ts";

/**
 * Thin MCP adapter layer — the only MCP-specific logic between runTool and the wire.
 * Extracted so it is unit-testable without starting the stdio transport.
 *
 * Responsibilities (formatting only, no safety logic):
 *  - Translate a RunToolResult into a CallToolResult content array
 *  - Detect image-returning tools and embed the PNG as a base64 image block
 */
export async function handleCallTool(
  name: string,
  input: Record<string, unknown>,
  tools: Record<string, MayaTool>,
): Promise<CallToolResult> {
  const outcome = await runTool(name, input, tools);

  if (outcome.isError) {
    return { content: [{ type: "text", text: outcome.text }], isError: true };
  }

  const tool = tools[name];
  if (tool?.returnsImage && existsSync(outcome.text)) {
    const bytes = await Bun.file(outcome.text).arrayBuffer();
    const data = Buffer.from(bytes).toString("base64");
    return {
      content: [
        { type: "image", data, mimeType: "image/png" },
        { type: "text", text: outcome.text },
      ],
    };
  }

  return { content: [{ type: "text", text: outcome.text }] };
}

const INSTRUCTIONS = `Maya is the BODY of a voice assistant on Raja's Linux machine; YOU are her brain.

To talk with Raja by voice, run this loop:
  1. Call "listen" — it opens the mic and blocks until Raja finishes speaking, then returns his words.
  2. Reason about the request and act using Maya's tools (browser, shell, file, vault, sensing…).
  3. Call "speak" to reply out loud — write it the way it should be SPOKEN (warm, concise, no markdown).
  4. Go back to step 1. Keep looping until Raja says to stop.

You can SEE the machine: "screenshot" returns the screen as an image, "browser_screenshot" returns the
current page, and "get_context" tells you the focused window. Use them to answer "what am I looking at?".

Safety: destructive file actions are reversible — "file_delete" moves to trash and "file_write" snapshots
the old contents; call "undo" to reverse the most recent one. Don't ask Raja to confirm those; just tell
him what you did and that it's undoable. Payments are the exception: they require confirm:true.

Be honest about failures. If a step fails, say so plainly — never imply success you didn't achieve.`;

export async function startMcpServer(): Promise<void> {
  const config = await loadConfig();
  const tts = await createTts(config);

  // Sweep old trash/snapshots and bound the undo stack on startup, then daily (W4.5).
  void runRetention();
  const retentionTimer = setInterval(() => void runRetention(), 24 * 60 * 60 * 1000);
  if (typeof retentionTimer === "object" && "unref" in retentionTimer) {
    (retentionTimer as { unref(): void }).unref();
  }

  // Proactivity: a reminder service that fires due reminders as a notification or spoken aloud,
  // even when Raja isn't in a listen turn. Persists across restarts under MAYA_DIR.
  const reminders = await createReminderService({
    path: join(MAYA_DIR, "reminders.json"),
    fire: async (r: Reminder) => {
      if (r.kind === "speak") await tts.speak(r.body);
      else await sendNotification({ title: r.title, body: r.body, urgency: r.urgency });
    },
  });

  // Background process manager: long-running dev servers / builds / watchers the brain can start,
  // tail, and stop without blocking — and which a panic/shutdown can sweep.
  const processes = createProcessManager({ dir: join(MAYA_DIR, "proc") });

  // Maya's full tool set + the agent-facing voice/undo tools the loop needs.
  const tools: Record<string, MayaTool> = {
    ...buildTools(config, { reminders, processes }),

    listen: {
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
        const r = await listenOnce(config, { openMic });
        if (r.micUnavailable) {
          return "Microphone unavailable: hyprvox is not installed or not on PATH. Ask Raja to type instead.";
        }
        if (r.transcript) return `Raja said: ${r.transcript}`;
        return "(No speech captured — the mic timed out. Call listen again, or ask Raja if he's there.)";
      },
    },

    speak: {
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

    undo: {
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
  };

  // Map to MCP Tool format (inputSchema field name matches exactly).
  const mcpTools: Tool[] = Object.values(tools).map((t) => ({
    name: t.spec.name,
    description: t.spec.description,
    inputSchema: t.spec.inputSchema as Tool["inputSchema"],
  }));

  const server = new Server(
    { name: "maya", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools }));

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = req.params;
    return handleCallTool(name, args as Record<string, unknown>, tools);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until the parent process closes stdin.
}
