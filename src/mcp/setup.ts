/**
 * maya setup — install the generated Maya skill for supported agents, with optional MCP fallback
 * registration through each agent's own CLI.
 */
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { installSkill, type SkillClient } from "../skill/install.ts";

type Client = SkillClient;
type SetupClient = Client | "all";

interface SetupOptions {
  withMcp?: boolean;
  rootDir?: string;
}

function parseClient(client?: string): SetupClient | undefined {
  if (!client) return undefined;
  if (client === "claude" || client === "codex" || client === "all") return client;
  return undefined;
}

function skillTargets(client?: SetupClient): Client[] {
  if (!client || client === "all") return ["claude", "codex"];
  return [client];
}

/** The exact command an agent should run to launch Maya's MCP server. */
function mayaLaunchCommand(): string[] {
  // setup.ts lives at src/mcp/setup.ts, so the CLI entry is src/index.ts one level up.
  const entry = realpathSync(join(import.meta.dir, "..", "index.ts"));
  // process.execPath is the absolute path to the bun running us — safer than relying on PATH.
  return [process.execPath, entry, "serve"];
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

async function registerMcp(client?: SetupClient): Promise<void> {
  const only = client && client !== "all" ? client : undefined;
  const launch = mayaLaunchCommand();
  console.log(`\nMaya MCP launch command:\n  ${launch.join(" ")}\n`);

  let attempted = false;

  if (!only || only === "claude") {
    if (await onPath("claude")) {
      attempted = true;
      const r = await registerClaude(launch);
      console.log(r.ok ? "✓ Claude MCP: registered." : `✗ Claude MCP failed:\n${r.out}`);
    } else if (only === "claude") {
      console.error("✗ claude CLI not found on PATH.");
    }
  }

  if (!only || only === "codex") {
    if (await onPath("codex")) {
      attempted = true;
      const r = await registerCodex(launch);
      console.log(r.ok ? "✓ Codex MCP: registered." : `✗ Codex MCP failed:\n${r.out}`);
    } else if (only === "codex") {
      console.error("✗ codex CLI not found on PATH.");
    }
  }

  if (!attempted) {
    console.log("No supported agent CLI found for MCP registration (looked for: claude, codex).");
    return;
  }

  console.log('\nRestart your agent, then try: "Maya, what am I looking at?"');
  console.log("(The agent should call Maya's `listen` tool to start the voice loop.)");
}

export async function setupMcp(client?: string, options: SetupOptions = {}): Promise<void> {
  const parsed = parseClient(client);
  if (client && !parsed) {
    console.error(`Unknown client "${client}". Use: maya setup [claude|codex|all]`);
    process.exitCode = 1;
    return;
  }

  for (const target of skillTargets(parsed)) {
    const result = installSkill(target, options.rootDir);
    console.log(`✓ ${target} skill: ${result.status} ${result.path}`);
  }

  if (!options.withMcp) {
    console.log("\nRestart the agent so it can pick up the refreshed Maya skill.");
    return;
  }

  await registerMcp(parsed);
}
