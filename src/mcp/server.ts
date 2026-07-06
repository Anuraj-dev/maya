import { existsSync } from "node:fs";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, MAYA_DIR } from "../config/index.ts";
import { buildTools, type MayaTool } from "../tools/index.ts";
import { runTool } from "../core/run-tool.ts";
import { runRetention } from "../safety/audit.ts";
import { createTts } from "../voice/tts.ts";
import { sendNotification } from "../tools/proactive.ts";
import { createReminderService, type Reminder } from "../proactive/reminders.ts";
import { createProcessManager } from "../system/processes.ts";
import { buildExtraMcpTools } from "./extra-tools.ts";

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

export function listMcpTools(tools: Record<string, MayaTool>): Tool[] {
  return Object.values(tools).map((tool) => ({
    name: tool.spec.name,
    description: tool.spec.description,
    inputSchema: tool.spec.inputSchema as Tool["inputSchema"],
  }));
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

function startRetentionSweep(): void {
  void runRetention();
  const retentionTimer = setInterval(() => void runRetention(), 24 * 60 * 60 * 1000);
  if (typeof retentionTimer === "object" && "unref" in retentionTimer) {
    (retentionTimer as { unref(): void }).unref();
  }
}

async function buildRuntimeTools(): Promise<Record<string, MayaTool>> {
  const config = await loadConfig();
  const tts = await createTts(config);
  const reminders = await createReminderService({
    path: join(MAYA_DIR, "reminders.json"),
    fire: async (r: Reminder) => {
      if (r.kind === "speak") await tts.speak(r.body);
      else await sendNotification({ title: r.title, body: r.body, urgency: r.urgency });
    },
  });
  const processes = createProcessManager({ dir: join(MAYA_DIR, "proc") });
  return Object.fromEntries(
    [...Object.values(buildTools(config, { reminders, processes })), ...buildExtraMcpTools({ config, tts })]
      .map((tool) => [tool.spec.name, tool] as const),
  );
}

export async function startMcpServer(): Promise<void> {
  startRetentionSweep();
  const tools = await buildRuntimeTools();
  const server = new Server(
    { name: "maya", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listMcpTools(tools) }));

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = req.params;
    return handleCallTool(name, args as Record<string, unknown>, tools);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
