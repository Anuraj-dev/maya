import { useCallback, useEffect, useRef, useState } from "react";
import type { Confirmation, MayaSnapshot, MayaState, TaskItem, TaskStatus } from "./state.ts";

/**
 * Mock driver for the preview. Simulates the daemon: lets you jump to any state by hand,
 * and plays a scripted "open a site, hit the floor, report back" run so every visual —
 * eyes, task queue, Approve/Deny — can be seen without the real brain wired up.
 */

const EMPTY: MayaSnapshot = { state: "idle", caption: "Say “Maya…” to begin.", tasks: [] };

type Step =
  | { at: number; state?: MayaState; caption?: string; confirmation?: Confirmation }
  | { at: number; addTask: TaskItem }
  | { at: number; task: { id: string; status: TaskStatus } };

// A scripted run, in ms offsets. Mirrors a real Phase-1 browser task.
const SCRIPT: Step[] = [
  { at: 0, state: "listening", caption: "Listening…" },
  { at: 1400, state: "thinking", caption: "Let me work out how to do that…" },
  { at: 3000, state: "acting", caption: "Opening the browser…" },
  { at: 3100, addTask: { id: "t1", label: "Open page", detail: "example.com", status: "running" } },
  { at: 4600, task: { id: "t1", status: "done" } },
  { at: 4700, addTask: { id: "t2", label: "Read heading", detail: "ariaSnapshot", status: "running" } },
  { at: 6000, task: { id: "t2", status: "done" } },
  { at: 6200, state: "awaiting", caption: "You asked me to delete the temp file. Confirm?" },
  {
    at: 6200,
    confirmation: { prompt: "Delete ~/Downloads/old-report.tmp", category: "file_delete" },
  },
];

// After the user answers the confirmation, we resume with this tail.
const TAIL_APPROVE: Step[] = [
  { at: 0, state: "acting", caption: "Deleting the file…", confirmation: undefined },
  { at: 100, addTask: { id: "t3", label: "Delete file", detail: "old-report.tmp", status: "running" } },
  { at: 1300, task: { id: "t3", status: "done" } },
  { at: 1500, state: "speaking", caption: "Done. The heading reads “Example Domain,” and the file is gone." },
  { at: 5200, state: "idle", caption: "Anything else?" },
];

const TAIL_DENY: Step[] = [
  { at: 0, state: "speaking", caption: "Understood — I’ll leave the file alone.", confirmation: undefined },
  { at: 100, addTask: { id: "t3", label: "Delete file", detail: "denied by you", status: "failed" } },
  { at: 3600, state: "idle", caption: "Anything else?" },
];

function applyStep(snap: MayaSnapshot, step: Step): MayaSnapshot {
  const next: MayaSnapshot = { ...snap, tasks: [...snap.tasks] };
  if ("state" in step && step.state) next.state = step.state;
  if ("caption" in step && step.caption !== undefined) next.caption = step.caption;
  if ("confirmation" in step) next.confirmation = step.confirmation;
  if ("addTask" in step) next.tasks.push(step.addTask);
  if ("task" in step) {
    next.tasks = next.tasks.map((t) => (t.id === step.task.id ? { ...t, status: step.task.status } : t));
  }
  return next;
}

export function useMockMaya() {
  const [snap, setSnap] = useState<MayaSnapshot>(EMPTY);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const play = useCallback(
    (script: Step[], base: MayaSnapshot) => {
      let working = base;
      for (const step of script) {
        timers.current.push(
          setTimeout(() => {
            working = applyStep(working, step);
            setSnap(working);
          }, step.at),
        );
      }
    },
    [],
  );

  const setState = useCallback(
    (state: MayaState) => {
      clearTimers();
      setSnap((s) => ({
        ...s,
        state,
        caption: PREVIEW_CAPTIONS[state],
        confirmation: state === "awaiting" ? DEMO_CONFIRMATION : undefined,
      }));
    },
    [clearTimers],
  );

  const runDemo = useCallback(() => {
    clearTimers();
    const base: MayaSnapshot = { state: "idle", caption: "", tasks: [] };
    setSnap(base);
    play(SCRIPT, base);
  }, [clearTimers, play]);

  const answer = useCallback(
    (approved: boolean) => {
      clearTimers();
      setSnap((s) => {
        const base = { ...s, confirmation: undefined };
        play(approved ? TAIL_APPROVE : TAIL_DENY, base);
        return base;
      });
    },
    [clearTimers, play],
  );

  const reset = useCallback(() => {
    clearTimers();
    setSnap(EMPTY);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return { snap, setState, runDemo, answer, reset };
}

const PREVIEW_CAPTIONS: Record<MayaState, string> = {
  idle: "Say “Maya…” to begin.",
  listening: "Listening…",
  thinking: "Let me think about that…",
  acting: "Working on it…",
  speaking: "Here’s what I found for you.",
  awaiting: "This will delete a file. Approve?",
  error: "Something went wrong — I’ve stopped.",
};

const DEMO_CONFIRMATION: Confirmation = {
  prompt: "Delete ~/Downloads/old-report.tmp",
  category: "file_delete",
};
