export const CLI_VERSION = "1";

export type CommandCategory =
  | "runtime"
  | "legacy-agent"
  | "diagnostic"
  | "mcp"
  | "discovery";

export interface OptionSpec {
  long: string;
  short?: string;
  type: "boolean" | "string";
  description: string;
  defaultValue?: boolean | string;
  negates?: string;
}

export interface ArgSpec {
  name: string;
  required?: boolean;
  variadic?: boolean;
}

export interface CommandResult {
  text?: string;
  data?: unknown;
}

export interface CommandContext {
  json: boolean;
  args: string[];
  values: Record<string, unknown>;
}

export interface CommandSpec {
  path: string[];
  summary: string;
  description: string;
  category: CommandCategory;
  options?: OptionSpec[];
  args?: ArgSpec[];
  run: (ctx: CommandContext) => Promise<CommandResult | void>;
}

export interface ParsedCommand {
  spec: CommandSpec;
  json: boolean;
  help: boolean;
  values: Record<string, unknown>;
  positionals: string[];
}

export interface CliError extends Error {
  code: string;
  exitCode: number;
  details?: Record<string, unknown>;
}
