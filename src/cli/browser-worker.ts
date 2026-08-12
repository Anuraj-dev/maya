import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { join, resolve } from "node:path";
import { mayaDir } from "../config/index.ts";
import { invalidUsage, executionFailed } from "./errors.ts";
import { readPngDimensions } from "./tool.ts";
import type { CommandResult } from "./types.ts";

const ALLOWED_TOOLS = new Set([
  "browser_navigate",
  "browser_read",
  "browser_click",
  "browser_click_selector",
  "browser_type",
  "browser_type_selector",
  "browser_screenshot",
]);
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

interface BrowserRequest {
  tool: string;
  input: Record<string, unknown>;
}

interface BrowserResponse {
  ok: boolean;
  text: string;
  isError: boolean;
  returnsImage?: boolean;
}

function workerPaths() {
  const dir = mayaDir();
  return {
    dir,
    socket: join(dir, "browser-cli.sock"),
    pid: join(dir, "browser-cli.pid"),
    log: join(dir, "browser-cli.log"),
  };
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function staleWorker(paths: ReturnType<typeof workerPaths>): boolean {
  if (!existsSync(paths.pid)) return true;
  const pid = Number(readFileSync(paths.pid, "utf8").trim());
  return !Number.isInteger(pid) || pid < 1 || !processAlive(pid);
}

async function sendRequest(request: BrowserRequest): Promise<BrowserResponse> {
  const { socket: socketPath } = workerPaths();
  return new Promise((resolveResponse, reject) => {
    const socket = createConnection(socketPath);
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Browser worker timed out."));
    }, 35_000);

    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      clearTimeout(timeout);
      socket.end();
      try {
        resolveResponse(JSON.parse(buffer.slice(0, newline)) as BrowserResponse);
      } catch {
        reject(new Error("Browser worker returned invalid JSON."));
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function workerUnavailable(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && ["ENOENT", "ECONNREFUSED"].includes(String((error as Error & { code?: string }).code));
}

async function startWorker(): Promise<void> {
  const paths = workerPaths();
  mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  if (existsSync(paths.socket) && staleWorker(paths)) unlinkSync(paths.socket);
  if (existsSync(paths.pid) && staleWorker(paths)) unlinkSync(paths.pid);

  const logFd = openSync(paths.log, "a", 0o600);
  const entry = process.env.MAYA_BROWSER_WORKER_ENTRY ?? join(import.meta.dir, "browser-worker-entry.ts");
  const proc = Bun.spawn([process.execPath, entry], {
    env: { ...process.env },
    stdin: "ignore",
    stdout: logFd,
    stderr: logFd,
  });
  proc.unref();
  closeSync(logFd);

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (existsSync(paths.socket)) return;
    if (proc.exitCode !== null) throw new Error(`Browser worker exited with code ${proc.exitCode}.`);
    await Bun.sleep(50);
  }
  throw new Error(`Browser worker did not create ${paths.socket}.`);
}

export async function runBrowserTool(tool: string, input: Record<string, unknown>): Promise<CommandResult> {
  if (!ALLOWED_TOOLS.has(tool)) throw invalidUsage(`Unsupported curated browser tool: ${tool}`);

  let response: BrowserResponse;
  try {
    response = await sendRequest({ tool, input });
  } catch (error) {
    if (!workerUnavailable(error)) {
      throw executionFailed(error instanceof Error ? error.message : String(error));
    }
    try {
      await startWorker();
      response = await sendRequest({ tool, input });
    } catch (error) {
      throw executionFailed(error instanceof Error ? error.message : String(error));
    }
  }

  if (!response.ok) throw executionFailed(response.text, { tool });
  if (response.returnsImage) {
    const dimensions = await readPngDimensions(response.text);
    return {
      text: response.text,
      data: dimensions ? { path: response.text, ...dimensions } : { path: response.text },
    };
  }
  return { text: response.text, data: { output: response.text } };
}

export async function startBrowserWorker(): Promise<void> {
  const paths = workerPaths();
  mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  if (existsSync(paths.socket)) {
    if (!staleWorker(paths)) throw new Error("A Maya browser worker is already running.");
    unlinkSync(paths.socket);
  }
  if (existsSync(paths.pid) && staleWorker(paths)) unlinkSync(paths.pid);
  writeFileSync(paths.pid, `${process.pid}\n`, { mode: 0o600 });

  const [{ loadConfig }, { buildTools }, { runTool }, { closeBrowser }] = await Promise.all([
    import("../config/index.ts"),
    import("../tools/index.ts"),
    import("../core/run-tool.ts"),
    import("../tools/browser.ts"),
  ]);
  const tools = buildTools(await loadConfig());
  let idleTimer: ReturnType<typeof setTimeout>;
  let stopping = false;

  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      void (async () => {
        let response: BrowserResponse;
        try {
          const request = JSON.parse(line) as BrowserRequest;
          if (!ALLOWED_TOOLS.has(request.tool) || !request.input || typeof request.input !== "object") {
            throw new Error("Invalid browser worker request.");
          }
          const outcome = await runTool(request.tool, request.input, tools);
          response = {
            ...outcome,
            returnsImage: outcome.ok && tools[request.tool]?.returnsImage === true,
          };
        } catch (error) {
          response = {
            ok: false,
            isError: true,
            text: error instanceof Error ? error.message : String(error),
          };
        }
        socket.end(`${JSON.stringify(response)}\n`);
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => void stop(), IDLE_TIMEOUT_MS);
      })();
    });
  });

  const cleanupFiles = () => {
    if (existsSync(paths.socket)) unlinkSync(paths.socket);
    if (existsSync(paths.pid)) unlinkSync(paths.pid);
  };
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(idleTimer);
    await closeBrowser().catch(() => {});
    await new Promise<void>((done) => server.close(() => done()));
    cleanupFiles();
  };

  const stopFromSignal = () => {
    cleanupFiles();
    void stop();
  };
  process.on("SIGTERM", stopFromSignal);
  process.on("SIGINT", stopFromSignal);
  server.listen(paths.socket, () => chmodSync(paths.socket, 0o600));
  idleTimer = setTimeout(() => void stop(), IDLE_TIMEOUT_MS);
  await new Promise<void>((done, reject) => {
    server.once("close", done);
    server.once("error", reject);
  });
}

export function resolveScreenshotPath(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidUsage('Option "--out" requires a path.', { option: "--out" });
  }
  return resolve(value);
}

export function parseIndex(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const text = String(value);
  if (!/^\d+$/.test(text)) {
    throw invalidUsage('Option "--index" must be a non-negative integer.', { option: "--index", value });
  }
  return Number(text);
}
