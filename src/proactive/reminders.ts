/**
 * Proactivity core — desktop notifications and scheduled reminders.
 *
 * This is the first step away from Maya being purely reactive: she can surface information to
 * Raja WITHOUT being spoken to first (a notification now, or a reminder later). The brain stays
 * a primitive's orchestrator — it converts natural language ("in 5 minutes", "at 3pm") into a
 * concrete delaySeconds / ISO timestamp; the body just schedules and fires.
 *
 * Design for testability (mirrors safety/floor.ts): the interesting logic is PURE —
 *   buildNotifyArgs  : input -> notify-send argv
 *   buildReminder    : (input, now) -> Reminder | throws a clear error
 *   partitionDue     : (reminders, now) -> { due, pending }
 * The ReminderService wraps those with persistence + a tick loop; tests drive tick() directly
 * so nothing depends on real timers.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type Urgency = "low" | "normal" | "critical";
export type ReminderKind = "notify" | "speak";

export interface NotifyInput {
  title?: string;
  body: string;
  urgency?: Urgency;
  /** Icon name or path passed to notify-send -i (e.g. "dialog-information"). */
  icon?: string;
}

export interface ReminderInput {
  body: string;
  title?: string;
  /** Fire this many seconds from now. Mutually exclusive with `at`. */
  delaySeconds?: number;
  /** Fire at this ISO-8601 timestamp. Mutually exclusive with `delaySeconds`. */
  at?: string;
  /** How to deliver: a desktop notification (default) or spoken aloud. */
  kind?: ReminderKind;
  urgency?: Urgency;
}

export interface Reminder {
  id: string;
  fireAt: number; // epoch ms
  kind: ReminderKind;
  title: string;
  body: string;
  urgency: Urgency;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Pure cores
// ---------------------------------------------------------------------------

/** Build the argv for `notify-send`. Pure — no spawning — so it is trivially unit-testable. */
export function buildNotifyArgs(input: NotifyInput): string[] {
  const body = String(input.body ?? "").trim();
  if (!body) throw new Error("notify: body is required.");
  const title = String(input.title ?? "Maya").trim() || "Maya";
  const args = ["--app-name=Maya"];
  if (input.urgency) args.push(`--urgency=${input.urgency}`);
  if (input.icon) args.push("-i", String(input.icon));
  args.push(title, body);
  return args;
}

const URGENCIES: ReadonlySet<string> = new Set(["low", "normal", "critical"]);

/**
 * Turn a ReminderInput into a concrete Reminder fixed to an absolute fire time.
 * Throws a clear, user-facing error on bad input (the MCP layer surfaces .message).
 */
export function buildReminder(input: ReminderInput, now: number, id: string): Reminder {
  const body = String(input.body ?? "").trim();
  if (!body) throw new Error("remind: body is required (what should I remind you about?).");

  const hasDelay = typeof input.delaySeconds === "number";
  const hasAt = typeof input.at === "string" && input.at.trim() !== "";
  if (hasDelay && hasAt) {
    throw new Error("remind: pass either delaySeconds or at, not both.");
  }
  if (!hasDelay && !hasAt) {
    throw new Error("remind: pass delaySeconds (e.g. 300) or at (ISO timestamp).");
  }

  let fireAt: number;
  if (hasDelay) {
    const secs = input.delaySeconds as number;
    if (!Number.isFinite(secs) || secs < 0) throw new Error("remind: delaySeconds must be a non-negative number.");
    fireAt = now + Math.round(secs * 1000);
  } else {
    const parsed = Date.parse(input.at as string);
    if (Number.isNaN(parsed)) throw new Error(`remind: could not parse time "${input.at}" — use an ISO timestamp.`);
    fireAt = parsed;
  }

  const kind: ReminderKind = input.kind === "speak" ? "speak" : "notify";
  const urgency: Urgency = URGENCIES.has(String(input.urgency)) ? (input.urgency as Urgency) : "normal";
  const title = String(input.title ?? "Reminder").trim() || "Reminder";

  return { id, fireAt, kind, title, body, urgency, createdAt: now };
}

/** Split reminders into those due at `now` (fireAt <= now) and those still pending. Pure. */
export function partitionDue(
  reminders: readonly Reminder[],
  now: number,
): { due: Reminder[]; pending: Reminder[] } {
  const due: Reminder[] = [];
  const pending: Reminder[] = [];
  for (const r of reminders) (r.fireAt <= now ? due : pending).push(r);
  return { due, pending };
}

/** Human-readable one-liner for a reminder (used by reminders_list and confirmations). */
export function describeReminder(r: Reminder, now: number): string {
  const secs = Math.max(0, Math.round((r.fireAt - now) / 1000));
  const when =
    secs >= 3600 ? `in ${Math.round(secs / 3600)}h` :
    secs >= 60 ? `in ${Math.round(secs / 60)}m` :
    secs > 0 ? `in ${secs}s` : "now";
  return `[${r.id}] ${when}: ${r.body}${r.kind === "speak" ? " (spoken)" : ""}`;
}

// ---------------------------------------------------------------------------
// Persistence (best-effort JSON file)
// ---------------------------------------------------------------------------

export async function loadReminders(path: string): Promise<Reminder[]> {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(data) ? (data as Reminder[]) : [];
  } catch {
    return [];
  }
}

export async function saveReminders(path: string, reminders: readonly Reminder[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(reminders, null, 2));
}

// ---------------------------------------------------------------------------
// Service — persistence + a tick loop. tick(now) is public so tests stay deterministic.
// ---------------------------------------------------------------------------

export interface ReminderServiceDeps {
  /** Where to persist pending reminders so they survive an MCP restart. */
  path: string;
  /** Deliver a due reminder (notify or speak). Errors are swallowed so one bad fire can't wedge the loop. */
  fire: (r: Reminder) => Promise<void> | void;
  /** Poll interval; pass 0 to disable the internal timer (tests call tick() manually). */
  intervalMs?: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}

export interface ReminderService {
  add(input: ReminderInput): Reminder;
  list(): Reminder[];
  cancel(id: string): boolean;
  /** Fire everything due at `at`, persist the remainder. Returns the count fired. */
  tick(at?: number): Promise<number>;
  stop(): void;
}

/**
 * Create the service. Loads any persisted reminders, optionally starts a poll timer, and
 * exposes add/list/cancel/tick. The MCP server wires `fire` to notify-send or speak.
 */
export async function createReminderService(deps: ReminderServiceDeps): Promise<ReminderService> {
  const now = deps.now ?? Date.now;
  let reminders = await loadReminders(deps.path);
  let seq = reminders.length;
  let timer: ReturnType<typeof setInterval> | undefined;

  // Persist synchronously so a reminder is durable the instant it's set (survives an immediate
  // crash) and so a freshly-created service over the same file sees the latest state at once.
  const persist = () => {
    try {
      mkdirSync(dirname(deps.path), { recursive: true });
      writeFileSync(deps.path, JSON.stringify(reminders, null, 2));
    } catch {
      /* best-effort: a failed persist must never break add/cancel/tick */
    }
  };

  const nextId = (): string => {
    seq += 1;
    return `r${seq}-${Math.random().toString(36).slice(2, 6)}`;
  };

  const service: ReminderService = {
    add(input) {
      const r = buildReminder(input, now(), nextId());
      reminders = [...reminders, r];
      persist();
      return r;
    },
    list() {
      return [...reminders].sort((a, b) => a.fireAt - b.fireAt);
    },
    cancel(id) {
      const before = reminders.length;
      reminders = reminders.filter((r) => r.id !== id);
      if (reminders.length !== before) persist();
      return reminders.length !== before;
    },
    async tick(at = now()) {
      const { due, pending } = partitionDue(reminders, at);
      if (due.length === 0) return 0;
      reminders = pending;
      persist();
      for (const r of due) {
        try {
          await deps.fire(r); // a bad fire must never wedge the loop
        } catch {
          /* swallow */
        }
      }
      return due.length;
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };

  const interval = deps.intervalMs ?? 1000;
  if (interval > 0) {
    timer = setInterval(() => void service.tick().catch(() => {}), interval);
    if (typeof timer === "object" && "unref" in timer) (timer as { unref(): void }).unref();
  }

  return service;
}
