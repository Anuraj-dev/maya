import { executionFailed } from "./errors.ts";
import type { CommandResult } from "./types.ts";

interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function captureLegacyOutput(run: () => Promise<void>): Promise<CaptureResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalExitCode = process.exitCode;

  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  };
  process.exitCode = 0;

  try {
    await run();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  const exitCode = process.exitCode ?? 0;
  process.exitCode = originalExitCode;
  return {
    stdout: stdout.join("\n"),
    stderr: stderr.join("\n"),
    exitCode,
  };
}

export async function runLegacyCommand(run: () => Promise<void>, json: boolean): Promise<CommandResult | void> {
  if (!json) {
    await run();
    return;
  }

  const result = await captureLegacyOutput(run);
  if (result.exitCode !== 0) {
    throw executionFailed(result.stderr || result.stdout || "Command failed.", { stderr: result.stderr || null });
  }

  return {
    data: {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    },
  };
}
