import type { MayaTool, ToolSpec } from "../tools/index.ts";
import { executionFailed, invalidUsage } from "./errors.ts";
import type { CommandSpec } from "./types.ts";

export async function loadCliTools(): Promise<Record<string, MayaTool>> {
  const [{ loadConfig }, { buildTools }] = await Promise.all([
    import("../config/index.ts"),
    import("../tools/index.ts"),
  ]);
  return buildTools(await loadConfig());
}

function sortedToolSpecs(tools: Record<string, MayaTool>): ToolSpec[] {
  return Object.values(tools)
    .map((tool) => tool.spec)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCliToolSpecs(): Promise<ToolSpec[]> {
  return sortedToolSpecs(await loadCliTools());
}

function parseToolInput(value: string | undefined): Record<string, unknown> {
  if (value === undefined) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw invalidUsage("Tool input must be a JSON object.", { input: value });
  }
}

async function readPngDimensions(path: string): Promise<{ width: number; height: number } | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  const isPng = bytes.length >= 24
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[12] === 0x49
    && bytes[13] === 0x48
    && bytes[14] === 0x44
    && bytes[15] === 0x52;
  if (!isPng) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export const TOOL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ["tool", "list"],
    category: "discovery",
    summary: "List registered tools with concise descriptions.",
    description: "List the active headless tool registry in deterministic name order.",
    run: async () => {
      const specs = await listCliToolSpecs();
      return {
        text: specs.map((spec) => `${spec.name}  ${spec.description}`).join("\n"),
        data: {
          tools: specs.map(({ name, description }) => ({ name, description })),
        },
      };
    },
  },
  {
    path: ["tool", "describe"],
    category: "discovery",
    summary: "Return one registered tool contract.",
    description: "Return one tool's description and JSON input schema without unrelated contracts.",
    args: [{ name: "name", required: true }],
    run: async ({ args }) => {
      const spec = (await loadCliTools())[args[0]!]?.spec;
      if (!spec) throw executionFailed(`Unknown tool: ${args[0]}`, { tool: args[0] });
      return { text: JSON.stringify(spec, null, 2), data: spec };
    },
  },
  {
    path: ["tool", "call"],
    category: "action",
    summary: "Execute any registered tool through the safety wrapper.",
    description: "Call one active tool through Maya's enforced path; pass input as --json '{...}'.",
    args: [
      { name: "name", required: true },
      { name: "input", required: false },
    ],
    run: async ({ args }) => {
      const tools = await loadCliTools();
      const name = args[0]!;
      const input = parseToolInput(args[1]);
      const { runTool } = await import("../core/run-tool.ts");
      const outcome = await runTool(name, input, tools);
      if (!outcome.ok) throw executionFailed(outcome.text, { tool: name });
      if (tools[name]?.returnsImage) {
        const dimensions = await readPngDimensions(outcome.text);
        if (dimensions) return { text: outcome.text, data: { path: outcome.text, ...dimensions } };
      }
      return { text: outcome.text, data: { output: outcome.text } };
    },
  },
];
