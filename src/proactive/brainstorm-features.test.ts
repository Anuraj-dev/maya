/**
 * brainstorm-features.test.ts — the executable spec for Maya's capability expansion (see plan.md).
 *
 * We work spec-by-test: each new capability is described here as behavior FIRST, then implemented
 * to green. Tests assert what Maya *does* given an input, at the highest pure seam — never how the
 * loop is wired (mirrors floor.test.ts / effort.test.ts).
 *
 *   ✅ Phase A1 (proactivity: notify + reminders) — implemented & asserted below.
 *   🚧 Phase A2–A4 and beyond — `test.todo` markers that document the roadmap; fill them in as we
 *      build each slice. A todo is a promise, not a failure.
 */
import { expect, test, describe } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildNotifyArgs,
  buildReminder,
  partitionDue,
  describeReminder,
  createReminderService,
  type Reminder,
} from "./reminders.ts";
import {
  tailLines,
  describeProc,
  createProcessManager,
  type ManagedProcess,
} from "../system/processes.ts";

// ---------------------------------------------------------------------------
// A1 — notify: build the notify-send argv (pure)
// ---------------------------------------------------------------------------
describe("notify args", () => {
  test("defaults the title to Maya and tags the app name", () => {
    const args = buildNotifyArgs({ body: "Build finished" });
    expect(args).toContain("--app-name=Maya");
    // title then body are the trailing positional args
    expect(args.slice(-2)).toEqual(["Maya", "Build finished"]);
  });

  test("passes through title, urgency, and icon", () => {
    const args = buildNotifyArgs({ title: "Heads up", body: "PR merged", urgency: "critical", icon: "dialog-information" });
    expect(args).toContain("--urgency=critical");
    expect(args).toContain("-i");
    expect(args).toContain("dialog-information");
    expect(args.slice(-2)).toEqual(["Heads up", "PR merged"]);
  });

  test("rejects an empty body", () => {
    expect(() => buildNotifyArgs({ body: "   " })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// A1 — remind: turn loose input into a concrete absolute fire time (pure)
// ---------------------------------------------------------------------------
describe("buildReminder", () => {
  const NOW = 1_000_000_000_000;

  test("relative delaySeconds becomes an absolute fireAt", () => {
    const r = buildReminder({ body: "stand up", delaySeconds: 300 }, NOW, "r1");
    expect(r.fireAt).toBe(NOW + 300_000);
    expect(r.kind).toBe("notify"); // default
    expect(r.urgency).toBe("normal"); // default
  });

  test("absolute ISO `at` is parsed", () => {
    const at = new Date(NOW + 3_600_000).toISOString();
    const r = buildReminder({ body: "meeting", at }, NOW, "r2");
    expect(r.fireAt).toBe(Date.parse(at));
  });

  test("kind=speak and urgency are honored", () => {
    const r = buildReminder({ body: "tea", delaySeconds: 60, kind: "speak", urgency: "low" }, NOW, "r3");
    expect(r.kind).toBe("speak");
    expect(r.urgency).toBe("low");
  });

  test("rejects empty body, both-times, neither-time, and bad values", () => {
    expect(() => buildReminder({ body: "" }, NOW, "x")).toThrow();
    expect(() => buildReminder({ body: "a", delaySeconds: 1, at: "2020-01-01" }, NOW, "x")).toThrow();
    expect(() => buildReminder({ body: "a" }, NOW, "x")).toThrow();
    expect(() => buildReminder({ body: "a", delaySeconds: -5 }, NOW, "x")).toThrow();
    expect(() => buildReminder({ body: "a", at: "not-a-date" }, NOW, "x")).toThrow();
  });
});

describe("partitionDue", () => {
  const mk = (id: string, fireAt: number): Reminder => ({
    id, fireAt, kind: "notify", title: "Reminder", body: id, urgency: "normal", createdAt: 0,
  });

  test("splits reminders at the clock", () => {
    const list = [mk("past", 100), mk("now", 200), mk("future", 300)];
    const { due, pending } = partitionDue(list, 200);
    expect(due.map((r) => r.id)).toEqual(["past", "now"]);
    expect(pending.map((r) => r.id)).toEqual(["future"]);
  });
});

describe("describeReminder", () => {
  test("renders a human countdown", () => {
    const r: Reminder = { id: "r9", fireAt: 1000 + 120_000, kind: "notify", title: "Reminder", body: "lunch", urgency: "normal", createdAt: 1000 };
    expect(describeReminder(r, 1000)).toContain("[r9]");
    expect(describeReminder(r, 1000)).toContain("in 2m");
    expect(describeReminder(r, 1000)).toContain("lunch");
  });
});

// ---------------------------------------------------------------------------
// A1 — ReminderService: add / list / cancel / fire, deterministic via injected clock + tick()
// ---------------------------------------------------------------------------
describe("ReminderService", () => {
  const newPath = () => join(mkdtempSync(join(tmpdir(), "maya-rem-")), "reminders.json");

  test("adds, lists soonest-first, fires when due, and persists the remainder", async () => {
    let clock = 0;
    const fired: string[] = [];
    const path = newPath();
    const svc = await createReminderService({
      path,
      now: () => clock,
      intervalMs: 0, // no real timer — we drive tick() by hand
      fire: (r) => { fired.push(r.body); },
    });

    svc.add({ body: "later", delaySeconds: 100 });
    svc.add({ body: "soon", delaySeconds: 10 });
    expect(svc.list().map((r) => r.body)).toEqual(["soon", "later"]); // sorted by fireAt

    clock = 10_000; // 10s later → only "soon" is due
    expect(await svc.tick()).toBe(1);
    expect(fired).toEqual(["soon"]);
    expect(svc.list().map((r) => r.body)).toEqual(["later"]);

    // a fresh service over the same file sees the surviving reminder (persistence)
    const reloaded = await createReminderService({ path, now: () => clock, intervalMs: 0, fire: () => {} });
    expect(reloaded.list().map((r) => r.body)).toEqual(["later"]);
  });

  test("cancel removes a pending reminder by id", async () => {
    const svc = await createReminderService({ path: newPath(), now: () => 0, intervalMs: 0, fire: () => {} });
    const r = svc.add({ body: "x", delaySeconds: 60 });
    expect(svc.cancel(r.id)).toBe(true);
    expect(svc.cancel(r.id)).toBe(false);
    expect(svc.list()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// C-dev — background process manager (start / list / tail-logs / stop)
// ---------------------------------------------------------------------------
describe("tailLines", () => {
  test("returns the last n lines, ignoring a trailing newline", () => {
    expect(tailLines("a\nb\nc\n", 2)).toBe("b\nc");
    expect(tailLines("a\nb\nc", 5)).toBe("a\nb\nc");
    expect(tailLines("a\nb", 0)).toBe("");
  });
});

describe("describeProc", () => {
  test("renders running vs exited status", () => {
    const base: ManagedProcess = {
      id: "p1", name: "dev", command: "bun dev", pid: 4242,
      startedAt: 0, status: "running", exitCode: null, logPath: "/x",
    };
    expect(describeProc(base, 5000)).toContain("running 5s");
    expect(describeProc(base, 5000)).toContain("pid 4242");
    const exited = { ...base, status: "exited" as const, exitCode: 0 };
    expect(describeProc(exited, 5000)).toContain("exited(0)");
  });
});

describe("ProcessManager", () => {
  const newDir = () => mkdtempSync(join(tmpdir(), "maya-proc-"));

  test("starts a process, captures its output, lists it, and reports exit", async () => {
    const mgr = createProcessManager({ dir: newDir() });
    const p = mgr.start({ command: "echo hello-maya", name: "greeter" });
    expect(p.pid).toBeGreaterThan(0);
    expect(mgr.list().map((x) => x.id)).toContain(p.id);

    // wait for it to finish, then its captured stdout is tail-able and status flips to exited
    while (mgr.get(p.id)?.status === "running") await Bun.sleep(15);
    expect(mgr.get(p.id)?.status).toBe("exited");
    expect(mgr.get(p.id)?.exitCode).toBe(0);
    expect(await mgr.logs(p.id)).toContain("hello-maya");
  });

  test("independent managers preserve distinct processes in one shared directory", async () => {
    const dir = newDir();
    const first = createProcessManager({ dir });
    const second = createProcessManager({ dir });
    const a = first.start({ command: "sleep 30", name: "first" });
    const b = second.start({ command: "sleep 30", name: "second" });

    try {
      expect(a.id).not.toBe(b.id);
      const reloaded = createProcessManager({ dir });
      expect(reloaded.list().map((process) => process.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    } finally {
      for (const managed of [a, b]) {
        try {
          process.kill(-managed.pid, "SIGKILL");
        } catch {
          try {
            process.kill(managed.pid, "SIGKILL");
          } catch {
            // Already exited.
          }
        }
      }
    }
  });

  test("stop() terminates a long-running process; stopAll sweeps", async () => {
    const mgr = createProcessManager({ dir: newDir() });
    const p = mgr.start({ command: "sleep 30" });
    expect(mgr.get(p.id)?.status).toBe("running");
    expect(await mgr.stop(p.id)).toBe(true);
    while (mgr.get(p.id)?.status === "running") await Bun.sleep(15);
    expect(mgr.get(p.id)?.status).toBe("exited");
    expect(await mgr.stop(p.id)).toBe(false); // already exited
    expect(mgr.stopAll()).toBe(0); // nothing left running
  });

  test("a TERM-resistant process remains running and can still be force-stopped", async () => {
    const mgr = createProcessManager({ dir: newDir() });
    const p = mgr.start({ command: "trap '' TERM; while :; do sleep 1; done", name: "term-resistant" });

    try {
      await Bun.sleep(100);
      expect(await mgr.stop(p.id)).toBe(false);
      expect(mgr.get(p.id)?.status).toBe("running");

      expect(await mgr.stop(p.id, "SIGKILL")).toBe(true);
      expect(mgr.get(p.id)?.status).toBe("exited");
    } finally {
      try {
        process.kill(-p.pid, "SIGKILL");
      } catch {
        // Already exited.
      }
    }
  });

  test("rejects an empty command", () => {
    const mgr = createProcessManager({ dir: newDir() });
    expect(() => mgr.start({ command: "  " })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Roadmap — fill these in as each slice lands (see plan.md §4)
// ---------------------------------------------------------------------------

const todo = () => {};

// A2 — system-state sense (battery / cpu / mem / disk / net / now-playing / volume)
test.todo("system_state returns a structured snapshot of the machine", todo);

// A3 — audio + media control
test.todo("audio get/set volume + mute via wpctl", todo);
test.todo("media play/pause/next via MPRIS (gdbus)", todo);

// A4 — get_context fixed for KWin (active window via KWin scripting over gdbus)
test.todo("get_context returns the active window title+class on KDE Plasma Wayland", todo);

// B1 — window management (KWin D-Bus / kdotool; hyprctl when on Hyprland)
test.todo("desktop_list_windows enumerates open windows with focusable ids", todo);
test.todo("desktop_focus brings a window to the foreground", todo);

// B2 — input synthesis (ydotool)
test.todo("desktop_type / desktop_hotkey / desktop_click_at synthesize input", todo);
