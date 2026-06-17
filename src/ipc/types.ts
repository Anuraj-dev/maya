/**
 * IPC contract between the Maya daemon and the Electron overlay.
 * Mirrors hyprvox/src/shared/ipc-types.ts — newline-delimited JSON over a Unix socket.
 */

export const IPC_PROTOCOL_VERSION = 1;

/** Drives the overlay's eyes + container styling. */
export type MayaStatus =
  | "idle"
  | "listening" // mic open (wake heard or auto-asked), capturing speech
  | "thinking" // model reasoning between actions
  | "acting" // executing a tool
  | "speaking" // TTS playing
  | "awaiting" // blocked on the user (clarification or confirmation)
  | "error";

export type TaskStatus = "pending" | "running" | "done" | "failed";

export interface TaskItem {
  id: string;
  label: string; // human-facing, e.g. "Opening github.com"
  status: TaskStatus;
}

/** A pending confirmation the overlay renders as Approve/Deny. */
export interface PendingConfirmation {
  id: string;
  question: string;
  category?: string; // irreversible category that triggered it, if any
}

export interface MayaState {
  status: MayaStatus;
  /** Live task queue for the current command. */
  tasks: TaskItem[];
  /** What Maya last said / is saying (subtitle). */
  speech?: string;
  /** Set when status === "awaiting" and a yes/no confirm is pending. */
  confirmation?: PendingConfirmation;
  error?: string;
  timestamp: number;
}

export type IPCMessage =
  | ({ type: "hello"; version: number } & MayaState)
  | ({ type: "state" } & MayaState)
  // overlay -> daemon
  | { type: "confirm"; id: string; result: "allow" | "deny" }
  | { type: "abort" };
