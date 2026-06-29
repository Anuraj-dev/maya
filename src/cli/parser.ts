import { invalidCommand, invalidOption, invalidUsage } from "./errors.ts";
import type {
  CommandSpec,
  GlobalOptionSpec,
  ParsedCommand,
  ParsedGlobalOptions,
} from "./types.ts";

function matchesGlobalOption(token: string, option: GlobalOptionSpec): boolean {
  return token === option.long || token === option.short;
}

function normalizeArgName(name: string): string {
  return name
    .replace(/^-+/, "")
    .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function parseGlobalOptions(
  argv: string[],
  options: GlobalOptionSpec[],
): ParsedGlobalOptions {
  const boundary = argv.indexOf("--");
  const optionTokens = boundary === -1 ? argv : argv.slice(0, boundary);
  const has = (key: GlobalOptionSpec["key"]): boolean => {
    const option = options.find((candidate) => candidate.key === key);
    return option ? optionTokens.some((token) => matchesGlobalOption(token, option)) : false;
  };

  return {
    help: has("help"),
    json: has("json"),
    version: has("version"),
  };
}

export function findCommandGroup(
  argv: string[],
  specs: CommandSpec[],
  globalOptions: GlobalOptionSpec[],
): string[] | null {
  const globals = parseGlobalOptions(argv, globalOptions);
  if (!globals.help) return null;

  const boundary = argv.indexOf("--");
  const optionTokens = boundary === -1 ? argv : argv.slice(0, boundary);
  const path = optionTokens.filter(
    (token) => !globalOptions.some((option) => matchesGlobalOption(token, option)),
  );
  if (path.length === 0 || path.some((token) => token.startsWith("-"))) return null;

  return specs.some(
    (spec) => spec.path.length > path.length && path.every((segment, index) => spec.path[index] === segment),
  )
    ? path
    : null;
}

export function parseCommand(
  argv: string[],
  specs: CommandSpec[],
  globalOptions: GlobalOptionSpec[],
): ParsedCommand | null {
  if (argv.length === 0) return null;

  const globals = parseGlobalOptions(argv, globalOptions);
  const boundary = argv.indexOf("--");
  const optionTokens = boundary === -1 ? argv : argv.slice(0, boundary);
  const escapedPositionals = boundary === -1 ? [] : argv.slice(boundary + 1);
  const filtered = optionTokens.filter(
    (token) => !globalOptions.some((option) => matchesGlobalOption(token, option)),
  );
  if (filtered.length === 0) return null;

  const matched = [...specs]
    .sort((a, b) => b.path.length - a.path.length)
    .find((spec) => spec.path.every((segment, index) => filtered[index] === segment));

  if (!matched) {
    const input = filtered[0]!;
    if (input.startsWith("-")) throw invalidOption(input, "unknown");
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
    const token = rest[index]!;
    const option = (matched.options ?? []).find((candidate) =>
      candidate.long === token || candidate.short === token,
    );

    if (!option) {
      if (token.startsWith("-")) throw invalidOption(token, "unknown");
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

  positionals.push(...escapedPositionals);

  validatePositionals(matched, positionals);

  return {
    spec: matched,
    json: globals.json,
    help: globals.help,
    values,
    positionals,
  };
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
