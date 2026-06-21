/**
 * shell_run — execute a shell command and return its output.
 *
 * The irreversible floor (safety/floor.ts) intercepts any command that looks like sudo,
 * a package installer, or recursive delete and forces confirmation before this runs.
 */
import type { MayaTool } from "./index.ts";

const SHELL_TIMEOUT_MS = 30_000;
const OUTPUT_MAX_CHARS = 8_000;

function trim(s: string): string {
  return s.length > OUTPUT_MAX_CHARS ? `${s.slice(0, OUTPUT_MAX_CHARS)}\n…[truncated]` : s;
}

export const shellTools: Record<string, MayaTool> = {
  shell_run: {
    spec: {
      name: "shell_run",
      description:
        "Run a shell command and return its combined stdout+stderr output. " +
        "Use for tasks that need the terminal: listing files, running scripts, checking status, etc. " +
        "Runs as Raja with his full privileges and IS logged to the audit trail. Most commands run " +
        "without confirmation — only genuinely unrecoverable ones (wiping home/root, raw disk writes, " +
        "mkfs, fork bombs, piping a download into a shell) are blocked and need confirm:true after you " +
        "clear it with Raja. Note: shell effects are NOT undoable, so think before destructive commands. " +
        "Keep commands concise and avoid interactive prompts.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to run (executed via /bin/sh -c).",
          },
          workdir: {
            type: "string",
            description: "Optional working directory. Defaults to the user's home directory.",
          },
          confirm: {
            type: "boolean",
            description:
              "Set true ONLY after Raja has approved a command flagged catastrophic (wiping home/root, " +
              "raw disk write, mkfs, fork bomb, curl|sh). Ignored for ordinary commands.",
          },
        },
        required: ["command"],
      },
    },
    execute: async (input) => {
      const command = String(input.command ?? "").trim();
      if (!command) return "No command provided.";
      const cwd = typeof input.workdir === "string" ? input.workdir : undefined;

      const proc = Bun.spawn(["/bin/sh", "-c", command], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "inherit",
      });

      const timeout = setTimeout(() => proc.kill("SIGTERM"), SHELL_TIMEOUT_MS);
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      clearTimeout(timeout);

      const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
      const out = trim(combined || "(no output)");
      return exitCode === 0
        ? out
        : `Exit code ${exitCode}:\n${out}`;
    },
  },
};
