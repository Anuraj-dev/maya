/**
 * The overlay's view of Maya. This mirrors what the daemon will broadcast over the IPC
 * socket later (see src/ipc/types.ts) — the preview just drives it from a mock instead.
 */

export type MayaState =
  | "idle" // waiting, calm
  | "listening" // mic open (hyprvox), capturing speech
  | "thinking" // brain is reasoning
  | "acting" // running a tool (browser/shell/etc.)
  | "speaking" // talking back (TTS)
  | "awaiting" // blocked on the user: a question or an Approve/Deny
  | "error"; // something failed

export type TaskStatus = "pending" | "running" | "done" | "failed";

export interface TaskItem {
  id: string;
  label: string;
  status: TaskStatus;
  /** optional short detail, e.g. the tool's target ("example.com") */
  detail?: string;
}

/** A pending confirmation surfaced by the irreversible floor (Approve/Deny). */
export interface Confirmation {
  prompt: string;
  /** e.g. "file_delete", "send_or_publish" — drives the warning copy */
  category: string;
}

export interface MayaSnapshot {
  state: MayaState;
  /** the line Maya is currently "saying" or her status caption */
  caption: string;
  tasks: TaskItem[];
  confirmation?: Confirmation;
}

export const STATE_LABEL: Record<MayaState, string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  acting: "Acting",
  speaking: "Speaking",
  awaiting: "Awaiting you",
  error: "Error",
};
