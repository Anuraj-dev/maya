import { useCallback, useEffect, useRef, useState } from "react";
import type { MayaSnapshot } from "./state.ts";

/** Bridge port — must match BRIDGE_PORT in maya/src/overlay/bridge.ts. */
const BRIDGE_PORT = 4517;

/**
 * Connects to the daemon's live bridge. While connected, the overlay renders the real run
 * (eyes, task queue, spoken captions); Approve/Deny clicks are sent back over the socket.
 * Auto-reconnects, so you can start the overlay before `maya live` and it just latches on.
 */
export function useLiveMaya() {
  const [snap, setSnap] = useState<MayaSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    const url = `ws://${location.hostname}:${BRIDGE_PORT}`;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; snapshot?: MayaSnapshot };
          if (msg.type === "snapshot" && msg.snapshot) setSnap(msg.snapshot);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const answer = useCallback((approved: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: "answer", approved }));
  }, []);

  const abort = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "abort" }));
  }, []);

  return { snap, connected, answer, abort };
}
