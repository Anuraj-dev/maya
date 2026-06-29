/**
 * Background process tools — start / list / tail-logs / stop long-running commands.
 *
 *   proc_start  — launch a long-lived command (dev server, build, watcher) and return its id
 *   proc_list   — list managed processes and their status
 *   proc_logs   — tail a managed process's captured output
 *   proc_stop   — stop a managed process
 *
 * These complement `shell_run` (which stays the right tool for quick one-shot commands): use
 * proc_* whenever a command should keep running after the call returns. The tools need the shared
 * ProcessManager (started by the MCP server); when it isn't injected they're omitted, mirroring
 * the voice_ask / remind pattern.
 */
import type { MayaTool } from "./index.ts";
import { describeProc, type ProcessManager, type StartInput } from "../system/processes.ts";

export interface ProcessDeps {
  processes?: ProcessManager;
}

export function processTools(deps: ProcessDeps = {}): Record<string, MayaTool> {
  const mgr = deps.processes;
  if (!mgr) return {};

  return {
    proc_start: {
      spec: {
        name: "proc_start",
        description:
          "Start a LONG-RUNNING command in the background and return its id immediately — for dev " +
          "servers, builds, watchers, anything that shouldn't block. Output is captured to a log you " +
          "can tail with proc_logs. Use plain shell_run for quick commands that finish on their own.",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to run (via /bin/sh -c), e.g. 'bun run dev'." },
            workdir: { type: "string", description: "Optional working directory. Defaults to home." },
            name: { type: "string", description: "Optional friendly name for listings." },
          },
          required: ["command"],
        },
      },
      execute: async (input) => {
        try {
          const p = mgr.start(input as unknown as StartInput);
          return `Started ${describeProc(p, Date.now())}. Tail it with proc_logs id "${p.id}", stop with proc_stop.`;
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      },
    },

    proc_list: {
      spec: {
        name: "proc_list",
        description: "List the background processes Maya is managing (newest first), with status and ids.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      execute: async () => {
        const now = Date.now();
        const list = mgr.list();
        if (list.length === 0) return "No background processes running.";
        return list.map((p) => describeProc(p, now)).join("\n");
      },
    },

    proc_logs: {
      spec: {
        name: "proc_logs",
        description: "Show the most recent output (stdout+stderr) of a managed background process.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "The process id from proc_start / proc_list." },
            lines: { type: "number", description: "How many trailing lines to show. Default 50." },
          },
          required: ["id"],
        },
      },
      execute: async (input) => {
        const id = String(input.id ?? "").trim();
        if (!id) return "No id provided.";
        const lines = typeof input.lines === "number" ? input.lines : 50;
        return mgr.logs(id, lines);
      },
    },

    proc_stop: {
      spec: {
        name: "proc_stop",
        description: "Stop a managed background process by id (sends SIGTERM, or SIGKILL if you pass force).",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "The process id to stop." },
            force: { type: "boolean", description: "Set true to SIGKILL instead of SIGTERM." },
          },
          required: ["id"],
        },
      },
      execute: async (input) => {
        const id = String(input.id ?? "").trim();
        if (!id) return "No id provided.";
        const force = input.force === true;
        if (!mgr.get(id)) throw new Error(`No process with id "${id}".`);
        const ok = await mgr.stop(id, force ? "SIGKILL" : "SIGTERM");
        if (ok) return `Stopped ${id}.`;

        if (mgr.get(id)?.status === "running") {
          const signal = force ? "SIGKILL" : "SIGTERM";
          const next = force ? "Inspect the process manually." : `Retry with: maya proc stop ${id} --force`;
          throw new Error(`Process "${id}" is still running after ${signal}. ${next}`);
        }
        throw new Error(`Process "${id}" has already exited.`);
      },
    },
  };
}
