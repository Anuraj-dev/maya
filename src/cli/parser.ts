import { invalidCommand, invalidOption, invalidUsage } from "./errors.ts";
import type { CommandSpec, ParsedCommand } from "./types.ts";

function isGlobalFlag(token: string): boolean {
  return token === "--json" || token === "--help";
}

function normalizeArgName(name: string): string {
  return name
    .replace(/^-+/, "")
    .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function parseCommand(argv: string[], specs: CommandSpec[]): ParsedCommand | null {
  if (argv.length === 0) return null;

  const json = argv.includes("--json");
  const help = argv.includes("--help");
  const filtered = argv.filter((token) => !isGlobalFlag(token));
  if (filtered.length === 0) return null;

  const matched = [...specs]
    .sort((a, b) => b.path.length - a.path.length)
    .find((spec) => spec.path.every((segment, index) => filtered[index] === segment));

  if (!matched) {
    throw invalidCommand(filtered.join(" "), specs);
  }

  const rest = filtered.slice(matched.path.length);
  const values: Record<string, unknown> = {};
  for (const option of matched.options ?? []) {
    if (option.defaultValue !== undefined) {
      values[option.negates ?? normalizeArgName(option.long)] = option.defaultValue;
    }
  }

  const positionals: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const option = (matched.options ?? []).find((candidate) =>
      candidate.long === token || candidate.short === token,
    );

    if (!option) {
      positionals.push(token);
      continue;
    }

    const key = option.negates ?? normalizeArgName(option.long);
    if (option.type === "boolean") {
      values[key] = option.negates ? false : true;
      continue;
    }

    const next = rest[index + 1];
    if (!next || next.startsWith("-")) throw invalidOption(token);
    values[key] = next;
    index += 1;
  }

  validatePositionals(matched, positionals);

  return { spec: matched, json, help, values, positionals };
}

function validatePositionals(spec: CommandSpec, positionals: string[]): void {
  const args = spec.args ?? [];
  let seenVariadic = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.variadic) {
      seenVariadic = true;
      if (arg.required !== false && positionals.length <= index) {
        throw invalidUsage(`Missing required argument <${arg.name}>.`, { argument: arg.name });
      }
      return;
    }

    if (arg.required !== false && positionals[index] === undefined) {
      throw invalidUsage(`Missing required argument <${arg.name}>.`, { argument: arg.name });
    }
  }

  if (!seenVariadic && positionals.length > args.length) {
    throw invalidUsage(`Too many arguments for "${spec.path.join(" ")}".`);
  }
}
