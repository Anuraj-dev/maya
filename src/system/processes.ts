/**
 * Background process manager — lifts Maya's biggest dev shackle.
 *
 * `shell_run` is one-shot with a 30s timeout: useless for dev servers, builds, watchers, or
 * anything long-running. This manager lets the brain START a long-lived process, walk away, then
 * LIST what's running, TAIL its logs, and STOP it later — the core of "operate my machine" for a
 * developer.
 *
 * Each process runs detached with stdout+stderr redirected to a per-process log file under
 * <dir>/<id>.log, so output survives even after the brain stops watching. Lifetime is the MCP
 * session: a process started here keeps running if the server restarts (detached), but the
 * manager loses its handle — reattaching across restarts is a future nicety (see plan.md §4-C).
 *
 * Testability (mirrors safety/floor.ts): the parsing/formatting cores are PURE —
 *   tailLines   : (text, n) -> last n lines
 *   describeProc: ManagedProcess -> one-line status
 * The manager itself is exercised by a real (fast) spawn in the spec.
 */
import { openSync, closeSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Subprocess } from "bun";

export interface StartInput {
  /** Shell command to run (executed via /bin/sh -c), e.g. "bun run dev". */
  command: string;
  /** Optional working directory. Defaults to home. */
  workdir?: string;
  /** Optional friendly name for listings. Defaults to the command. */
  name?: string;
}

export interface ManagedProcess {
  id: string;
  name: string;
  command: string;
  pid: number;
  startedAt: number;
  status: "running" | "exited";
  exitCode: number | null;
  logPath: string;
}

// ---------------------------------------------------------------------------
// Pure cores
// ---------------------------------------------------------------------------

/** Return the last `n` lines of `text` (trailing newline ignored). Pure. */
export function tailLines(text: string, n: number): string {
  if (n <= 0) return "";
  const lines = text.replace(/\n$/, "").split("\n");
  return lines.slice(-n).join("\n");
}

/** One-line human status for a managed process. Pure. */
export function describeProc(p: ManagedProcess, now: number): string {
  const age = Math.max(0, Math.round((now - p.startedAt) / 1000));
  const ago =
    age >= 3600 ? `${Math.round(age / 3600)}h` :
    age >= 60 ? `${Math.round(age / 60)}m` : `${age}s`;
  const state = p.status === "running" ? `running ${ago}` : `exited(${p.exitCode ?? "?"}) after ${ago}`;
  return `[${p.id}] ${state} · pid ${p.pid} · ${p.name}`;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

interface Entry {
  meta: ManagedProcess;
  proc: Subprocess;
}

export interface ProcessManager {
  start(input: StartInput): ManagedProcess;
  list(): ManagedProcess[];
  get(id: string): ManagedProcess | undefined;
  logs(id: string, lines?: number): Promise<string>;
  stop(id: string, signal?: NodeJS.Signals): boolean;
  /** Stop every running process (used by a global panic / shutdown). */
  stopAll(): number;
}

export function createProcessManager(deps: { dir: string }): ProcessManager {
  const entries = new Map<string, Entry>();
  let seq = 0;

  const ensureDir = () => {
    if (!existsSync(deps.dir)) mkdirSync(deps.dir, { recursive: true });
  };

  const nextId = (): string => {
    seq += 1;
    return `p${seq}`;
  };

  return {
    start(input) {
      const command = String(input.command ?? "").trim();
      if (!command) throw new Error("proc_start: command is required.");
      ensureDir();

      const id = nextId();
      const logPath = join(deps.dir, `${id}.log`);
      const cwd = input.workdir && input.workdir.trim() ? input.workdir : homedir();

      // Redirect stdout+stderr to the log file; detach so it outlives the brain's attention.
      const fd = openSync(logPath, "a");
      let proc: Subprocess;
      try {
        proc = Bun.spawn(["/bin/sh", "-c", command], {
          cwd,
          stdin: "ignore",
          stdout: fd,
          stderr: fd,
        });
      } finally {
        closeSync(fd); // the child holds its own dup of the fd
      }

      const meta: ManagedProcess = {
        id,
        name: input.name?.trim() || command,
        command,
        pid: proc.pid,
        startedAt: Date.now(),
        status: "running",
        exitCode: null,
        logPath,
      };
      entries.set(id, { meta, proc });

      // Mark exited when it finishes, but keep the entry so logs/status stay queryable.
      void proc.exited.then((code) => {
        meta.status = "exited";
        meta.exitCode = code;
      });

      return meta;
    },

    list() {
      return [...entries.values()].map((e) => e.meta).sort((a, b) => b.startedAt - a.startedAt);
    },

    get(id) {
      return entries.get(id)?.meta;
    },

    async logs(id, lines = 50) {
      const entry = entries.get(id);
      if (!entry) return `No process with id "${id}".`;
      if (!existsSync(entry.meta.logPath)) return "(no output yet)";
      const text = await Bun.file(entry.meta.logPath).text();
      const tail = tailLines(text, lines);
      return tail || "(no output yet)";
    },

    stop(id, signal = "SIGTERM") {
      const entry = entries.get(id);
      if (!entry) return false;
      if (entry.meta.status === "exited") return false;
      try {
        entry.proc.kill(signal);
        return true;
      } catch {
        return false;
      }
    },

    stopAll() {
      let n = 0;
      for (const e of entries.values()) {
        if (e.meta.status === "running") {
          try {
            e.proc.kill("SIGTERM");
            n += 1;
          } catch {
            /* ignore */
          }
        }
      }
      return n;
    },
  };
}
