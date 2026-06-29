import type { CommandCategory, CommandSpec, GlobalOptionSpec } from "./types.ts";

const CATEGORY_TITLES: Record<CommandCategory, string> = {
  runtime: "Runtime",
  action: "Actions",
  "legacy-agent": "Legacy Agent",
  diagnostic: "Diagnostic",
  mcp: "MCP",
  discovery: "Discovery",
};

function formatUsage(spec: CommandSpec): string {
  const path = spec.path.join(" ");
  const args = (spec.args ?? []).map((arg) => {
    const base = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
    return arg.variadic ? `${base}...` : base;
  });
  return ["maya", path, ...args].join(" ");
}

function formatOptions(spec: CommandSpec): string[] {
  return (spec.options ?? []).map((option) => {
    const names = [option.short, option.long].filter(Boolean).join(", ");
    const value = option.type === "string" ? ` <value>` : "";
    return `  ${names}${value}  ${option.description}`;
  });
}

export function renderRootHelp(specs: CommandSpec[], globalOptions: GlobalOptionSpec[]): string {
  const lines = [
    "maya <command>",
    "",
    "Agent-first CLI for Maya. Use `maya capabilities --json` for the full contract.",
    "",
  ];

  const categoryOrder = Object.keys(CATEGORY_TITLES) as CommandCategory[];

  // A nested command group (e.g. `tool`, `proc`) renders as a single line even
  // when its subcommands span categories; assign it to the earliest category
  // among its children so it appears exactly once with its full child count.
  const nestedGroups = new Map<string, CommandSpec[]>();
  for (const spec of specs) {
    if (spec.path.length > 1) {
      const name = spec.path[0]!;
      nestedGroups.set(name, [...(nestedGroups.get(name) ?? []), spec]);
    }
  }
  const groupCategory = new Map<string, CommandCategory>();
  for (const [name, children] of nestedGroups) {
    groupCategory.set(
      name,
      categoryOrder.find((category) => children.some((child) => child.category === category))!,
    );
  }

  for (const category of categoryOrder) {
    const singles = specs
      .filter((spec) => spec.path.length === 1 && spec.category === category)
      .map((spec) => ({ name: spec.path[0]!, text: `${formatUsage(spec)}  ${spec.summary}` }));
    const grouped = [...nestedGroups.entries()]
      .filter(([name]) => groupCategory.get(name) === category)
      .map(([name, children]) => ({
        name,
        text: `maya ${name} <command>  ${children.length} ${children.length === 1 ? "command" : "commands"}.`,
      }));
    if (singles.length === 0 && grouped.length === 0) continue;
    lines.push(`${CATEGORY_TITLES[category]}:`);
    const entries = [...singles, ...grouped].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      lines.push(`  ${entry.text}`);
    }
    lines.push("");
  }

  lines.push("Global options:");
  for (const option of globalOptions) {
    lines.push(`  ${[option.short, option.long].filter(Boolean).join(", ")}  ${option.description}`);
  }
  return lines.join("\n");
}

export function renderCommandHelp(spec: CommandSpec, globalOptions: GlobalOptionSpec[]): string {
  const lines = [formatUsage(spec), "", spec.description];
  const options = formatOptions(spec);
  if (options.length > 0) {
    lines.push("", "Options:", ...options);
  }
  lines.push("", "Global options:");
  for (const option of globalOptions) {
    lines.push(`  ${[option.short, option.long].filter(Boolean).join(", ")}  ${option.description}`);
  }
  return lines.join("\n");
}

export function renderGroupHelp(
  path: string[],
  specs: CommandSpec[],
  globalOptions: GlobalOptionSpec[],
): string {
  const commands = specs
    .filter((spec) => spec.path.length > path.length && path.every((segment, index) => spec.path[index] === segment))
    .sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")));
  const lines = [
    `maya ${path.join(" ")} <command>`,
    "",
    "Commands:",
    ...commands.map((spec) => `  ${formatUsage(spec)}  ${spec.summary}`),
    "",
    "Global options:",
  ];
  for (const option of globalOptions) {
    lines.push(`  ${[option.short, option.long].filter(Boolean).join(", ")}  ${option.description}`);
  }
  return lines.join("\n");
}
