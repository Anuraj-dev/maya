import { buildCapabilities } from "./capabilities.ts";
import { printError, printSuccess } from "./envelope.ts";
import { renderCommandHelp, renderRootHelp } from "./help.ts";
import { COMMAND_SPECS } from "./specs.ts";
import { parseCommand } from "./parser.ts";
import { executionFailed } from "./errors.ts";
import type { CliError } from "./types.ts";

function coerceCliError(error: unknown): CliError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "exitCode" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return error as CliError;
  }

  return executionFailed(error instanceof Error ? error.message : String(error));
}

export async function runCli(argv: string[]): Promise<number> {
  const command = argv.find((token) => token !== "--json" && token !== "--help") ?? "maya";
  const json = argv.includes("--json");

  try {
    const parsed = parseCommand(argv, COMMAND_SPECS);

    if (!parsed) {
      const text = renderRootHelp(COMMAND_SPECS);
      if (json) {
        console.log(JSON.stringify({
          ok: true,
          version: buildCapabilities(COMMAND_SPECS).version,
          command: "help",
          data: { text },
        }));
      } else {
        console.log(text);
      }
      return 0;
    }

    if (parsed.help) {
      printSuccess(parsed, {
        text: renderCommandHelp(parsed.spec),
        data: {
          name: `maya ${parsed.spec.path.join(" ")}`,
          description: parsed.spec.description,
        },
      });
      return 0;
    }

    const result = await parsed.spec.run({
      json: parsed.json,
      args: parsed.positionals,
      values: parsed.values,
    });
    printSuccess(parsed, result);
    return process.exitCode ?? 0;
  } catch (error) {
    const cliError = coerceCliError(error);
    printError(command, cliError, json);
    return cliError.exitCode;
  }
}
