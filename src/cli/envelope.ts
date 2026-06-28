import type { CliError, CommandResult, ParsedCommand } from "./types.ts";
import { CLI_VERSION } from "./types.ts";

export function commandName(parsed: ParsedCommand): string {
  return parsed.spec.path.join(" ");
}

export function printSuccess(parsed: ParsedCommand, result: CommandResult | void): void {
  if (!parsed.json) {
    if (result?.text) console.log(result.text);
    return;
  }

  console.log(JSON.stringify({
    ok: true,
    version: CLI_VERSION,
    command: commandName(parsed),
    data: result?.data ?? (result?.text ? { text: result.text } : null),
  }));
}

export function printError(command: string, error: CliError, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({
      ok: false,
      version: CLI_VERSION,
      command,
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    }));
    return;
  }

  console.error(`error [${error.code}]: ${error.message}`);
}
