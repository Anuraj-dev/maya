/**
 * Background process manager — lifts Maya's biggest dev shackle.
 *
 * `shell_run` is one-shot with a 30s timeout: useless for dev servers, builds, watchers, or
 * anything long-running. This manager lets the brain START a long-lived process, walk away, then
 * LIST what's running, TAIL its logs, and STOP it later — the core of "operate my machine" for a
 * developer.
 *
 * Each process runs detached with stdout+stderr redirected to a per-process log file under
 * <dir>/<id>.log, so output survives even after the brain stops watching. Process metadata is
 * persisted beside those logs, allowing later CLI invocations or a restarted MCP server to list,
 * tail, and signal the detached process by pid.
 *
 * Testability (mirrors safety/floor.ts): the parsing/formatting cores are PURE —
 *   tailLines   : (text, n) -> last n lines
 *   describeProc: ManagedProcess -> one-line status
 * The manager itself is exercised by a real (fast) spawn in the spec.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Subprocess } from "bun";

const LOG_MAX_LINES = 500;
const LOG_MAX_CHARS = 8_000;

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
  /** Linux process start-time token used to avoid signalling an unrelated process after pid reuse. */
  startToken?: string;
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
  proc?: Subprocess;
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
  const registryPath = join(deps.dir, "processes.json");

  const ensureDir = () => {
    if (!existsSync(deps.dir)) mkdirSync(deps.dir, { recursive: true });
  };

  const save = () => {
    ensureDir();
    const tempPath = `${registryPath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify([...entries.values()].map((entry) => entry.meta), null, 2));
    renameSync(tempPath, registryPath);
  };

  const readStartToken = (pid: number): string | undefined => {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const fieldsAfterCommand = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      return fieldsAfterCommand[19];
    } catch {
      return undefined;
    }
  };

  const isAlive = (meta: Pick<ManagedProcess, "pid" | "startToken">): boolean => {
    try {
      process.kill(meta.pid, 0);
      return !meta.startToken || readStartToken(meta.pid) === meta.startToken;
    } catch {
      return false;
    }
  };

  if (existsSync(registryPath)) {
    try {
      const stored = JSON.parse(readFileSync(registryPath, "utf8")) as ManagedProcess[];
      for (const meta of stored) {
        if (meta.status === "running" && !isAlive(meta)) {
          meta.status = "exited";
          meta.exitCode = null;
        }
        entries.set(meta.id, { meta });
      }
    } catch {
      // A damaged registry must not make process control unusable; new starts rebuild it.
    }
  }

  let seq = Math.max(
    0,
    ...[...entries.keys()].map((id) => Number(id.match(/^p(\d+)$/)?.[1] ?? 0)),
  );

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
          detached: true,
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
        startToken: readStartToken(proc.pid),
      };
      entries.set(id, { meta, proc });
      save();
      proc.unref();

      // Mark exited when it finishes, but keep the entry so logs/status stay queryable.
      void proc.exited.then((code) => {
        meta.status = "exited";
        meta.exitCode = code;
        save();
      });

      return meta;
    },

    list() {
      let changed = false;
      for (const entry of entries.values()) {
        if (entry.meta.status === "running" && !isAlive(entry.meta)) {
          entry.meta.status = "exited";
          entry.meta.exitCode = null;
          changed = true;
        }
      }
      if (changed) save();
      return [...entries.values()].map((e) => e.meta).sort((a, b) => b.startedAt - a.startedAt);
    },

    get(id) {
      const entry = entries.get(id);
      if (entry?.meta.status === "running" && !isAlive(entry.meta)) {
        entry.meta.status = "exited";
        entry.meta.exitCode = null;
        save();
      }
      return entry?.meta;
    },

    async logs(id, lines = 50) {
      const entry = entries.get(id);
      if (!entry) return `No process with id "${id}".`;
      if (!existsSync(entry.meta.logPath)) return "(no output yet)";
      const text = await Bun.file(entry.meta.logPath).text();
      const normalized = text.replace(/\n$/, "");
      if (!normalized) return "(no output yet)";

      const requestedLines = Math.max(1, Math.floor(lines));
      const effectiveLines = Math.min(requestedLines, LOG_MAX_LINES);
      const totalLines = normalized.split("\n").length;
      let tail = tailLines(normalized, effectiveLines);
      const notices: string[] = [];
      if (requestedLines > LOG_MAX_LINES) {
        notices.push(`…[limited to last ${LOG_MAX_LINES} lines]`);
      } else if (totalLines > effectiveLines) {
        notices.push(`…[truncated to last ${effectiveLines} lines]`);
      }
      if (tail.length > LOG_MAX_CHARS) {
        tail = tail.slice(-LOG_MAX_CHARS);
        notices.push(`…[truncated to last ${LOG_MAX_CHARS} characters]`);
      }
      return [...notices, tail].join("\n");
    },

    stop(id, signal = "SIGTERM") {
      const entry = entries.get(id);
      if (!entry) return false;
      if (entry.meta.status === "exited" || !isAlive(entry.meta)) {
        entry.meta.status = "exited";
        entry.meta.exitCode = null;
        save();
        return false;
      }
      try {
        try {
          process.kill(-entry.meta.pid, signal);
        } catch {
          process.kill(entry.meta.pid, signal);
        }
        entry.meta.status = "exited";
        entry.meta.exitCode = null;
        save();
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
            try {
              process.kill(-e.meta.pid, "SIGTERM");
            } catch {
              process.kill(e.meta.pid, "SIGTERM");
            }
            e.meta.status = "exited";
            e.meta.exitCode = null;
            n += 1;
          } catch {
            /* ignore */
          }
        }
      }
      if (n > 0) save();
      return n;
    },
  };
}
