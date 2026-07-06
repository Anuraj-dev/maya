import type { CliError, CommandSpec } from "./types.ts";

function makeError(
  code: string,
  message: string,
  exitCode: number,
  details?: Record<string, unknown>,
): CliError {
  const error = new Error(message) as CliError;
  error.code = code;
  error.exitCode = exitCode;
  error.details = details;
  return error;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) table[i]![0] = i;
  for (let j = 0; j < cols; j += 1) table[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      table[i]![j] = Math.min(
        table[i - 1]![j]! + 1,
        table[i]![j - 1]! + 1,
        table[i - 1]![j - 1]! + cost,
      );
    }
  }

  return table[a.length]![b.length]!;
}

export function suggestCommand(input: string, specs: CommandSpec[]): string | undefined {
  const commands = specs.map((spec) => spec.path.join(" "));
  const ranked = commands
    .map((command) => ({ command, distance: levenshtein(input, command) }))
    .sort((a, b) => a.distance - b.distance || a.command.localeCompare(b.command));

  return ranked[0] && ranked[0].distance <= 3 ? ranked[0].command : undefined;
}

export function invalidCommand(input: string, specs: CommandSpec[]): CliError {
  const suggestion = suggestCommand(input, specs);
  return makeError(
    "invalid_command",
    suggestion
      ? `Unknown command "${input}". Did you mean "${suggestion}"?`
      : `Unknown command "${input}".`,
    2,
    suggestion ? { suggestion } : undefined,
  );
}

export function invalidOption(option: string, reason: "missing_value" | "unknown" = "missing_value"): CliError {
  return makeError(
    "invalid_option",
    reason === "unknown" ? `Unknown option "${option}".` : `Option "${option}" requires a value.`,
    2,
    { option, reason },
  );
}

export function invalidUsage(message: string, details?: Record<string, unknown>): CliError {
  return makeError("invalid_usage", message, 2, details);
}

export function executionFailed(message: string, details?: Record<string, unknown>): CliError {
  return makeError("execution_failed", message, 1, details);
}
