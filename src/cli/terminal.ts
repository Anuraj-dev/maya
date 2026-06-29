import { executionFailed, invalidUsage } from "./errors.ts";
import type { CommandResult, CommandSpec } from "./types.ts";

async function runShellTool(
  command: string,
  values: Record<string, unknown>,
): Promise<CommandResult> {
  const [{ runTool }, { shellTools }] = await Promise.all([
    import("../core/run-tool.ts"),
    import("../tools/shell.ts"),
  ]);
  const input: Record<string, unknown> = { command };
  if (typeof values.workdir === "string") input.workdir = values.workdir;
  if (values.confirm === true) input.confirm = true;

  const outcome = await runTool("shell_run", input, shellTools);
  if (!outcome.ok) throw executionFailed(outcome.text, { tool: "shell_run" });
  return { text: outcome.text, data: { output: outcome.text } };
}

async function runProcessTool(
  name: "proc_start" | "proc_list" | "proc_logs" | "proc_stop",
  input: Record<string, unknown>,
): Promise<CommandResult> {
  const [{ runTool }, { mayaDir }, { createProcessManager }, { processTools }, { join }] = await Promise.all([
    import("../core/run-tool.ts"),
    import("../config/index.ts"),
    import("../system/processes.ts"),
    import("../tools/process.ts"),
    import("node:path"),
  ]);
  const processes = createProcessManager({ dir: join(mayaDir(), "proc") });
  const outcome = await runTool(name, input, processTools({ processes }));
  if (!outcome.ok) throw executionFailed(outcome.text, { tool: name });
  return { text: outcome.text, data: { output: outcome.text } };
}

function optionalPositiveInteger(value: unknown, option: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw invalidUsage(`${option} must be a positive integer.`, { option, value });
  }
  return parsed;
}

export const TERMINAL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ["terminal", "run"],
    category: "action",
    summary: "Run a bounded one-shot shell command.",
    description: "Execute a shell command through Maya's shared safety and audit wrapper.",
    args: [{ name: "command", required: true, variadic: true }],
    options: [
      {
        long: "--workdir",
        type: "string",
        description: "Run from this working directory instead of the home directory.",
      },
      {
        long: "--confirm",
        type: "boolean",
        description: "Confirm a command that the catastrophic-shell gate blocks.",
      },
    ],
    run: ({ args, values }) => runShellTool(args.join(" "), values),
  },
  {
    path: ["proc", "start"],
    category: "action",
    summary: "Start a managed background process.",
    description: "Start a long-running shell command and persist its id and log path for later CLI calls.",
    args: [{ name: "command", required: true, variadic: true }],
    options: [
      {
        long: "--workdir",
        type: "string",
        description: "Run from this working directory instead of the home directory.",
      },
      {
        long: "--name",
        type: "string",
        description: "Show this friendly name in process listings.",
      },
    ],
    run: ({ args, values }) => runProcessTool("proc_start", {
      command: args.join(" "),
      ...(typeof values.workdir === "string" ? { workdir: values.workdir } : {}),
      ...(typeof values.name === "string" ? { name: values.name } : {}),
    }),
  },
  {
    path: ["proc", "list"],
    category: "action",
    summary: "List managed background processes.",
    description: "List persistent process ids, states, pids, and friendly names newest first.",
    run: () => runProcessTool("proc_list", {}),
  },
  {
    path: ["proc", "logs"],
    category: "action",
    summary: "Read bounded output from a managed process.",
    description: "Return the most recent lines from a managed process log.",
    args: [{ name: "id", required: true }],
    options: [{
      long: "--lines",
      type: "string",
      description: "Return this many trailing lines (default 50).",
    }],
    run: ({ args, values }) => {
      const lines = optionalPositiveInteger(values.lines, "--lines");
      return runProcessTool("proc_logs", { id: args[0], ...(lines ? { lines } : {}) });
    },
  },
  {
    path: ["proc", "stop"],
    category: "action",
    summary: "Stop a managed background process.",
    description: "Stop a process group with SIGTERM, or SIGKILL when --force is supplied.",
    args: [{ name: "id", required: true }],
    options: [{
      long: "--force",
      type: "boolean",
      description: "Use SIGKILL instead of SIGTERM.",
    }],
    run: ({ args, values }) => runProcessTool("proc_stop", {
      id: args[0],
      ...(values.force === true ? { force: true } : {}),
    }),
  },
];
