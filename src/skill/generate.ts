import { join } from "node:path";
import { ConfigSchema } from "../config/index.ts";
import { validateDocsIndex, type CatalogEntry } from "../docs-index/validate.ts";
import { buildTools, toolSpecs } from "../tools/index.ts";
import { buildCapabilities, type CapabilitiesContract } from "../cli/capabilities.ts";
import { COMMAND_SPECS, GLOBAL_OPTIONS } from "../cli/specs.ts";

const DEFAULT_ROOT = join(import.meta.dir, "..", "..");

type ToolGroupConfig = {
  title: string;
  summary: string;
  scenario: string | null;
};

const TOOL_GROUP_CONFIG: Record<string, ToolGroupConfig> = {
  desktop: {
    title: "Desktop Tools",
    summary: "Use these to open a desktop app or hand a URL/file off to Raja's Linux session.",
    scenario: "open local apps or URLs",
  },
  browser: {
    title: "Browser Tools",
    summary: "Use these to drive a page, read it, type, click, scroll, or capture a browser screenshot.",
    scenario: "control the browser",
  },
  sensing: {
    title: "Screen Tools",
    summary: "Use these to inspect the active window, read the clipboard, or capture the full desktop.",
    scenario: "take a screenshot and see the screen",
  },
  file: {
    title: "File Tools",
    summary: "Use these to read, write, or reversibly delete local text files on Raja's machine.",
    scenario: "read or write local files",
  },
  voice: {
    title: "Voice Tools",
    summary: "Use these when a voice-capable Maya surface is available and the agent needs to talk out loud or hear Raja speak.",
    scenario: "speak or listen by voice",
  },
  memory: {
    title: "Memory Tools",
    summary: "Use these to persist or remove short factual memories Maya should keep across runs.",
    scenario: "remember facts",
  },
  proactive: {
    title: "Reminder Tools",
    summary: "Use these to notify Raja now or schedule reminders when the reminder service is wired in.",
    scenario: "set reminders",
  },
  terminal: {
    title: "Shell Tools",
    summary: "Use these to run focused shell commands; longer-lived work has curated `maya proc ...` commands.",
    scenario: "run shell commands and manage background processes",
  },
  safety: {
    title: "Safety Tools",
    summary: "Use these to reverse the last reversible Maya file change when the current surface exposes `undo`.",
    scenario: null,
  },
  vault: {
    title: "Vault Tools",
    summary: "Use these to read, search, append to, or replace Obsidian notes in Raja's vault.",
    scenario: "search the Obsidian vault",
  },
};

const COMMAND_GROUP_SUMMARY: Record<string, string> = {
  "legacy-agent": "Use these older entry points only when you explicitly need Maya's in-process agent loop or live overlay bridge.",
  action: "Use these curated commands for quick shell work, process management, and the generic tool-call escape hatch.",
  diagnostic: "Use these to inspect install health or verify the configured Anthropic connectivity.",
  discovery: "Use these to inspect Maya's contract, search its catalogs, or zoom in on one tool without crawling the repo.",
  mcp: "Use these only when the CLI is not enough and an agent truly needs Maya's optional MCP adapter.",
  runtime: "Use these for Maya's older daemon-based runtime.",
};

const COMMAND_GROUP_TITLES: Record<string, string> = {
  "legacy-agent": "Legacy Agent Commands",
  action: "Action Commands",
  diagnostic: "Diagnostic Commands",
  discovery: "Discovery Commands",
  mcp: "MCP Commands",
  runtime: "Runtime Commands",
};

function loadCapabilities(): CapabilitiesContract {
  const config = ConfigSchema.parse({});
  return buildCapabilities(COMMAND_SPECS, GLOBAL_OPTIONS, toolSpecs(buildTools(config)));
}

function joinNatural(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function renderArg(name: string, required: boolean, variadic: boolean): string {
  const core = variadic ? `${name}...` : name;
  return required ? `<${core}>` : `[${core}]`;
}

function renderCommandInvocation(command: CapabilitiesContract["commands"][number]): string {
  if (command.args.length === 0) return command.name;
  return `${command.name} ${command.args.map((arg) => renderArg(arg.name, arg.required, arg.variadic)).join(" ")}`;
}

function renderInvocationLine(commands: string[]): string {
  return commands.map((command) => `\`${command}\``).join(", ");
}

function buildScenarioDescription(entries: CatalogEntry[]): string {
  const scenarios = entries
    .map((entry) => TOOL_GROUP_CONFIG[entry.category]?.scenario)
    .filter((scenario): scenario is string => Boolean(scenario));
  const unique = [...new Set(scenarios)];
  return `${joinNatural(unique)}. Use the \`maya\` CLI whenever the user wants to act on Raja's Linux machine.`;
}

function renderCommandSections(contract: CapabilitiesContract): string[] {
  const sections: string[] = [];
  const grouped = new Map<string, CapabilitiesContract["commands"]>();

  for (const command of contract.commands) {
    const group = grouped.get(command.category) ?? [];
    group.push(command);
    grouped.set(command.category, group);
  }

  for (const [category, commands] of grouped) {
    sections.push(`## ${COMMAND_GROUP_TITLES[category] ?? `${category} Commands`}`);
    sections.push(COMMAND_GROUP_SUMMARY[category] ?? "Use these curated Maya commands when a higher-level entry point fits better than a raw tool call.");
    sections.push(renderInvocationLine(commands.map(renderCommandInvocation)));
    sections.push("");
  }

  return sections;
}

function renderToolSections(
  contract: CapabilitiesContract,
  entries: CatalogEntry[],
): string[] {
  const sections: string[] = [];
  const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
  const grouped = new Map<string, Array<{ name: string; command: string }>>();

  for (const tool of contract.tools) {
    const entry = entryByName.get(tool.name);
    if (!entry) continue;
    const group = grouped.get(entry.category) ?? [];
    group.push({ name: tool.name, command: tool.command });
    grouped.set(entry.category, group);
  }

  for (const [category, tools] of grouped) {
    const meta = TOOL_GROUP_CONFIG[category];
    if (!meta) continue;
    sections.push(`## ${meta.title}`);
    sections.push(meta.summary);
    sections.push(renderInvocationLine(tools.map((tool) => tool.command)));
    sections.push("");
  }

  return sections;
}

export function generateSkillMarkdown(rootDir: string = DEFAULT_ROOT): string {
  const contract = loadCapabilities();
  const index = validateDocsIndex(rootDir, []);
  const description = buildScenarioDescription(index.tools);

  return [
    "---",
    "name: maya",
    `description: "${description.replaceAll("\"", "\\\"")}"`,
    "---",
    "",
    "Maya is a local automation body on Raja's Linux machine. Drive it with `maya <command>`.",
    "",
    ...renderCommandSections(contract),
    ...renderToolSections(contract, index.tools),
    "## Going Deeper",
    "Reach for `maya capabilities` for the full contract, `maya tool describe <name>` for one tool's JSON schema, and `maya find <query>` to search the catalogs.",
    "",
    "The MCP server (`maya serve`) is a fallback — only reach for it if the CLI isn't enough.",
    "",
  ].join("\n");
}
