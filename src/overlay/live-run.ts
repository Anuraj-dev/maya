import { OverlayBridge } from "./bridge.ts";
import { createLiveSession } from "./session.ts";
import { runOnce } from "../agent/loop.ts";
import type { Config } from "../config/index.ts";

/**
 * Run one command with the overlay wired in live: starts the WebSocket bridge, waits for the
 * overlay to connect, then drives the task — eyes, task queue, spoken captions and
 * Approve/Deny all update in the browser in real time.
 */
export async function runLive(
  text: string,
  opts: { provider?: Config["brain"]["provider"] } = {},
): Promise<void> {
  const bridge = new OverlayBridge();
  console.error(`\n🛰  Overlay bridge live on ${bridge.url}`);
  console.error(`   Open the overlay → http://localhost:5173 (it connects automatically).`);
  console.error(`   Waiting for the overlay…`);

  const connected = await bridge.waitForClient(30_000);
  if (connected) console.error(`   ✅ Overlay connected — running.\n`);
  else console.error(`   ⚠️  No overlay after 30s; running anyway (open it to watch).\n`);

  const { sink } = createLiveSession(bridge);
  await runOnce(text, { provider: opts.provider, sink });

  console.error(`\n✨ Done — the overlay holds the final state. Ctrl+C to stop the bridge.`);
  await new Promise<never>(() => {}); // keep the bridge alive so the overlay stays live
}
