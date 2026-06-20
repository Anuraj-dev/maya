/**
 * maya setup — register Maya as an MCP (stdio) server with the agent(s) that will be her brain.
 *
 * We DON'T hand-edit config files: ~/.claude.json holds the user's account/oauth data and
 * ~/.codex/config.toml holds project trust levels — rewriting either by hand is fragile and
 * risky. Instead we drive each agent's own `mcp add` CLI, which owns its config format:
 *
 *   Claude Code:  claude mcp add maya --scope user -- <bun> <entry> mcp
 *   Codex:        codex  mcp add maya             -- <bun> <entry> mcp
 *
 * Idempotent: we `mcp remove` (ignoring "not found") before adding, so re-running updates the
 * launch command in place. Registers with every supported CLI found, or just the one named:
 *   maya setup            → all detected (claude, codex)
 *   maya setup claude     → Claude Code only
 *   maya setup codex      → Codex only
 */
import { join } from "node:path";
import { realpathSync } from "node:fs";

type Client = "claude" | "codex";

/** The exact command an agent should run to launch Maya's MCP server. */
function mayaLaunchCommand(): string[] {
  // setup.ts lives at src/mcp/setup.ts, so the CLI entry is src/index.ts one level up.
  const entry = realpathSync(join(import.meta.dir, "..", "index.ts"));
  // process.execPath is the absolute path to the bun running us — safer than relying on PATH.
  return [process.execPath, entry, "mcp"];
}

async function onPath(bin: string): Promise<boolean> {
  return (await Bun.which(bin)) !== null;
}

async function run(cmd: string[]): Promise<{ ok: boolean; out: string }> {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { ok: code === 0, out: `${out}${err}`.trim() };
}

async function registerClaude(launch: string[]): Promise<{ ok: boolean; out: string }> {
  await run(["claude", "mcp", "remove", "maya", "--scope", "user"]); // ignore "not found"
  return run(["claude", "mcp", "add", "maya", "--scope", "user", "--", ...launch]);
}

async function registerCodex(launch: string[]): Promise<{ ok: boolean; out: string }> {
  await run(["codex", "mcp", "remove", "maya"]); // ignore "not found"
  return run(["codex", "mcp", "add", "maya", "--", ...launch]);
}

export async function setupMcp(client?: string): Promise<void> {
  if (client && client !== "claude" && client !== "codex") {
    console.error(`Unknown client "${client}". Use: maya setup [claude|codex]`);
    process.exitCode = 1;
    return;
  }
  const only = client as Client | undefined;
  const launch = mayaLaunchCommand();
  console.log(`Maya MCP launch command:\n  ${launch.join(" ")}\n`);

  let attempted = false;

  if (!only || only === "claude") {
    if (await onPath("claude")) {
      attempted = true;
      const r = await registerClaude(launch);
      console.log(r.ok ? "✓ Registered with Claude Code (user scope)." : `✗ Claude Code failed:\n${r.out}`);
    } else if (only === "claude") {
      console.error("✗ claude CLI not found on PATH.");
    }
  }

  if (!only || only === "codex") {
    if (await onPath("codex")) {
      attempted = true;
      const r = await registerCodex(launch);
      console.log(r.ok ? "✓ Registered with Codex." : `✗ Codex failed:\n${r.out}`);
    } else if (only === "codex") {
      console.error("✗ codex CLI not found on PATH.");
    }
  }

  if (!attempted) {
    console.log("No supported agent CLI found (looked for: claude, codex). Install one, then re-run `maya setup`.");
    return;
  }

  console.log('\nRestart your agent, then try: "Maya, what am I looking at?"');
  console.log("(The agent should call Maya's `listen` tool to start the voice loop.)");
}
