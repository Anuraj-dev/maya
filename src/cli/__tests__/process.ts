import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_ENTRY = join(import.meta.dir, "../../index.ts");

export interface MayaCliRunOptions {
  entry?: string;
  env?: Record<string, string | undefined>;
  home?: string;
}

export interface MayaCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  parseEnvelope<T = unknown>(): T;
}

/**
 * Exercise Maya at the real process boundary with an isolated HOME by default.
 * Callers can supply a shared home when a scenario needs state to survive across runs.
 */
export async function runMayaCli(
  args: string[],
  options: MayaCliRunOptions = {},
): Promise<MayaCliResult> {
  const ownsHome = options.home === undefined;
  const home = options.home ?? mkdtempSync(join(tmpdir(), "maya-cli-test-"));

  try {
    const proc = Bun.spawn({
      cmd: [process.execPath, options.entry ?? DEFAULT_ENTRY, ...args],
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ...options.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
      },
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return {
      stdout,
      stderr,
      exitCode,
      parseEnvelope<T = unknown>(): T {
        return JSON.parse(stdout) as T;
      },
    };
  } finally {
    if (ownsHome) rmSync(home, { recursive: true, force: true });
  }
}
