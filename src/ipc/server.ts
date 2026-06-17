/**
 * IPC server: a Unix-domain socket that broadcasts MayaState to the overlay and receives
 * confirm/abort messages back. Direct port of hyprvox/src/daemon/ipc.ts (newline-delimited
 * JSON, stale-socket cleanup, versioned hello/state broadcast) adapted to MayaState.
 *
 * TODO(Phase 5): port the IPCServer class; broadcast(state) on every state change; parse
 * inbound { type: "confirm" | "abort" } and forward to the daemon.
 */
import type { MayaState } from "./types.ts";

export interface IpcServer {
  start(): Promise<void>;
  broadcast(state: MayaState): void;
  stop(): Promise<void>;
}

export {};
