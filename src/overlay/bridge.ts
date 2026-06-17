/**
 * Live bridge between the agent loop and the browser overlay preview.
 *
 * The overlay (Vite, http://localhost:5173) can't speak the daemon's Unix-socket IPC, so
 * for the preview we broadcast the same conceptual snapshot over a WebSocket. When we wrap
 * the overlay in Electron later, this gets swapped for the real ipc/server.ts socket — the
 * snapshot shape is intentionally the same.
 */

export const BRIDGE_PORT = 4517;

export type MayaState =
  | "idle"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "awaiting"
  | "error";

export type TaskStatus = "pending" | "running" | "done" | "failed";

export interface TaskItem {
  id: string;
  label: string;
  status: TaskStatus;
  detail?: string;
}

export interface Confirmation {
  prompt: string;
  category: string;
}

export interface Snapshot {
  state: MayaState;
  caption: string;
  tasks: TaskItem[];
  confirmation?: Confirmation;
}

type ClientMessage = { type: "answer"; approved: boolean } | { type: "abort" };

export class OverlayBridge {
  private server: ReturnType<typeof Bun.serve>;
  private snapshot: Snapshot = { state: "idle", caption: "", tasks: [] };
  private clients = 0;
  private resolveFirstClient!: () => void;
  private firstClient: Promise<void>;
  private pendingConfirm?: (approved: boolean) => void;
  private onAbortCb?: () => void;

  constructor(private port: number = BRIDGE_PORT) {
    this.firstClient = new Promise((resolve) => (this.resolveFirstClient = resolve));
    const self = this;
    this.server = Bun.serve({
      port,
      fetch(req, server) {
        if (server.upgrade(req, { data: undefined })) return undefined;
        return new Response("Maya overlay bridge — connect via WebSocket.\n");
      },
      websocket: {
        open(ws) {
          ws.subscribe("maya");
          self.clients++;
          self.resolveFirstClient();
          ws.send(JSON.stringify({ type: "snapshot", snapshot: self.snapshot }));
        },
        message(_ws, raw) {
          try {
            const msg = JSON.parse(String(raw)) as ClientMessage;
            if (msg.type === "answer" && self.pendingConfirm) {
              self.pendingConfirm(msg.approved);
              self.pendingConfirm = undefined;
            } else if (msg.type === "abort") {
              self.onAbortCb?.();
            }
          } catch {
            // ignore malformed client messages
          }
        },
        close() {
          self.clients = Math.max(0, self.clients - 1);
        },
      },
    });
  }

  get url(): string {
    return `ws://localhost:${this.port}`;
  }

  get clientCount(): number {
    return this.clients;
  }

  broadcast(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    this.server.publish("maya", JSON.stringify({ type: "snapshot", snapshot }));
  }

  /** Resolves true once an overlay connects, or false after timeoutMs. */
  async waitForClient(timeoutMs: number): Promise<boolean> {
    if (this.clients > 0) return true;
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const connected = this.firstClient.then(() => true);
    const result = await Promise.race([connected, timeout]);
    clearTimeout(timer!);
    return result;
  }

  /** Awaits the overlay's Approve/Deny click. */
  requestConfirmation(): Promise<boolean> {
    return new Promise((resolve) => (this.pendingConfirm = resolve));
  }

  /** Register a handler for the overlay's Esc/abort signal. */
  onAbort(cb: () => void): void {
    this.onAbortCb = cb;
  }

  stop(): void {
    this.server.stop(true);
  }
}
