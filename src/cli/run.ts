import { buildCapabilities } from "./capabilities.ts";
import { printError, printSuccess } from "./envelope.ts";
import { renderCommandHelp, renderGroupHelp, renderRootHelp } from "./help.ts";
import { COMMAND_SPECS, GLOBAL_OPTIONS } from "./specs.ts";
import { findCommandGroup, parseCommand, parseGlobalOptions } from "./parser.ts";
import { executionFailed } from "./errors.ts";
import { CLI_VERSION, MAYA_VERSION, type CliError } from "./types.ts";

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
  const globals = parseGlobalOptions(argv, GLOBAL_OPTIONS);
  const command = argv.find(
    (token) => !GLOBAL_OPTIONS.some((option) => token === option.long || token === option.short),
  ) ?? "maya";
  const json = globals.json;

  try {
    if (globals.version) {
      if (json) {
        console.log(JSON.stringify({
          ok: true,
          version: CLI_VERSION,
          command: "version",
          data: { version: MAYA_VERSION },
        }));
      } else {
        console.log(MAYA_VERSION);
      }
      return 0;
    }

    const groupPath = findCommandGroup(argv, COMMAND_SPECS, GLOBAL_OPTIONS);
    if (groupPath) {
      const text = renderGroupHelp(groupPath, COMMAND_SPECS, GLOBAL_OPTIONS);
      if (json) {
        console.log(JSON.stringify({
          ok: true,
          version: buildCapabilities(COMMAND_SPECS, GLOBAL_OPTIONS).version,
          command: groupPath.join(" "),
          data: { text },
        }));
      } else {
        console.log(text);
      }
      return 0;
    }

    const parsed = parseCommand(argv, COMMAND_SPECS, GLOBAL_OPTIONS);

    if (!parsed) {
      const text = renderRootHelp(COMMAND_SPECS, GLOBAL_OPTIONS);
      if (json) {
        console.log(JSON.stringify({
          ok: true,
          version: buildCapabilities(COMMAND_SPECS, GLOBAL_OPTIONS).version,
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
        text: renderCommandHelp(parsed.spec, GLOBAL_OPTIONS),
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
