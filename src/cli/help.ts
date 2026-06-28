import type { CommandCategory, CommandSpec } from "./types.ts";

const CATEGORY_TITLES: Record<CommandCategory, string> = {
  runtime: "Runtime",
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

export function renderRootHelp(specs: CommandSpec[]): string {
  const groups = new Map<CommandCategory, CommandSpec[]>();
  for (const spec of specs) {
    const list = groups.get(spec.category) ?? [];
    list.push(spec);
    groups.set(spec.category, list);
  }

  const lines = [
    "maya <command>",
    "",
    "Agent-first CLI for Maya. Use `maya capabilities --json` for the full contract.",
    "",
  ];

  for (const category of Object.keys(CATEGORY_TITLES) as CommandCategory[]) {
    const commands = (groups.get(category) ?? []).sort((a, b) =>
      a.path.join(" ").localeCompare(b.path.join(" ")),
    );
    if (commands.length === 0) continue;
    lines.push(`${CATEGORY_TITLES[category]}:`);
    for (const spec of commands) {
      lines.push(`  ${formatUsage(spec)}  ${spec.summary}`);
    }
    lines.push("");
  }

  lines.push("Global options:");
  lines.push("  --help  Show help");
  lines.push("  --json  Emit the versioned JSON envelope");
  return lines.join("\n");
}

export function renderCommandHelp(spec: CommandSpec): string {
  const lines = [formatUsage(spec), "", spec.description];
  const options = formatOptions(spec);
  if (options.length > 0) {
    lines.push("", "Options:", ...options);
  }
  lines.push("", "Global options:", "  --help  Show help", "  --json  Emit the versioned JSON envelope");
  return lines.join("\n");
}
