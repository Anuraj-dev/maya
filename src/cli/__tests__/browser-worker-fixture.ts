#!/usr/bin/env bun
import { chmodSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const dir = process.env.MAYA_DIR ?? join(homedir(), ".config", "maya");
const socketPath = join(dir, "browser-cli.sock");
const pidPath = join(dir, "browser-cli.pid");
mkdirSync(dir, { recursive: true });
writeFileSync(pidPath, `${process.pid}\n`);

const server = createServer((socket) => {
  socket.setEncoding("utf8");
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk;
    const newline = buffer.indexOf("\n");
    if (newline === -1) return;
    const request = JSON.parse(buffer.slice(0, newline)) as {
      tool: string;
      input: Record<string, unknown>;
    };
    writeFileSync(join(dir, "browser-request.json"), JSON.stringify(request));

    if (request.tool === "browser_screenshot") {
      const path = String(request.input.out);
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAADUlEQVR42mNk+M/wHwAFAgH/qn5U0QAAAABJRU5ErkJggg==",
        "base64",
      );
      writeFileSync(path, png);
      socket.end(`${JSON.stringify({ ok: true, text: path, isError: false, returnsImage: true })}\n`);
    } else {
      socket.end(`${JSON.stringify({
        ok: true,
        text: `fixture:${request.tool}`,
        isError: false,
      })}\n`);
    }
    server.close();
  });
});

server.listen(socketPath, () => chmodSync(socketPath, 0o600));
server.on("close", () => {
  try { unlinkSync(socketPath); } catch {}
  try { unlinkSync(pidPath); } catch {}
});
