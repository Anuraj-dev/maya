import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const entry = join(import.meta.dir, "index.ts");
const tempHome = join(tmpdir(), `maya-cli-test-${process.pid}`);

const expectedCapabilities = {
  version: "1",
  globalOptions: [
    { long: "--help", short: "-h", description: "Show help." },
    { long: "--json", description: "Emit the versioned JSON envelope." },
    { long: "--version", short: "-V", description: "Show the Maya version." },
  ],
  commands: [
    {
      name: "maya ask",
      category: "legacy-agent",
      summary: "Run one command through Maya's in-process agent loop.",
      description: "Run one terminal command through Maya's legacy in-process agent loop.",
      args: [{ name: "command", required: true, variadic: true }],
      options: [{
        long: "--provider",
        short: "-p",
        type: "string",
        description: "Brain provider: anthropic | gemini | ollama",
      }],
      supportsJson: true,
    },
    {
      name: "maya capabilities",
      category: "discovery",
      summary: "Return the full Maya CLI command contract.",
      description: "List every registered CLI command, argument, and option.",
      args: [],
      options: [],
      supportsJson: true,
    },
    {
      name: "maya live",
      category: "legacy-agent",
      summary: "Run one command with the live overlay bridge.",
      description: "Run one legacy agent command with the live overlay wired in.",
      args: [{ name: "command", required: true, variadic: true }],
      options: [{
        long: "--provider",
        short: "-p",
        type: "string",
        description: "Brain provider: anthropic | gemini | ollama",
      }],
      supportsJson: true,
    },
    {
      name: "maya mcp",
      category: "mcp",
      summary: "Start the MCP stdio server.",
      description: "Start Maya as an MCP stdio server.",
      args: [],
      options: [],
      supportsJson: true,
    },
    {
      name: "maya ping",
      category: "diagnostic",
      summary: "Verify the Anthropic key with a cheap API call.",
      description: "Run the small Anthropic connectivity check.",
      args: [],
      options: [],
      supportsJson: true,
    },
    {
      name: "maya setup",
      category: "mcp",
      summary: "Register Maya with supported coding-agent MCP clients.",
      description: "Register Maya with Claude Code and/or Codex MCP client config.",
      args: [{ name: "client", required: false, variadic: false }],
      options: [],
      supportsJson: true,
    },
    {
      name: "maya start",
      category: "runtime",
      summary: "Start the Maya daemon.",
      description: "Start the Maya daemon and optionally skip the overlay.",
      args: [],
      options: [{
        long: "--no-overlay",
        type: "boolean",
        description: "Run the daemon without launching the overlay.",
        defaultValue: true,
        negates: "overlay",
      }],
      supportsJson: true,
    },
    {
      name: "maya status",
      category: "runtime",
      summary: "Show daemon status.",
      description: "Report the Maya daemon status.",
      args: [],
      options: [],
      supportsJson: true,
    },
    {
      name: "maya stop",
      category: "runtime",
      summary: "Stop the Maya daemon.",
      description: "Stop the Maya daemon if it is running.",
      args: [],
      options: [],
      supportsJson: true,
    },
  ],
};

async function runCli(args: string[]) {
  const proc = Bun.spawn({
    cmd: [process.execPath, entry, ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: tempHome,
      XDG_CONFIG_HOME: join(tempHome, ".config"),
    },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

afterAll(async () => {
  await Bun.spawn(["rm", "-rf", tempHome]).exited;
});

describe("S1 — CLI process boundary", () => {
  test("maya --help exits 0 with grouped concise text", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("maya <command>");
    expect(result.stdout).toContain("Runtime:");
    expect(result.stdout).toContain("Discovery:");
    expect(result.stderr).toBe("");
  });

  test("maya --version preserves the existing version surface", async () => {
    const result = await runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("0.0.0\n");
    expect(result.stderr).toBe("");
  });

  test("unknown command exits non-zero with invalid_command and a suggestion", async () => {
    const result = await runCli(["stats"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("error [invalid_command]");
    expect(result.stderr).toContain('Did you mean "status"?');
  });

  test("--json wraps results in the versioned envelope", async () => {
    const result = await runCli(["capabilities", "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.version).toBe("1");
    expect(payload.command).toBe("capabilities");
    expect(Array.isArray(payload.data.commands)).toBe(true);
  });

  test("a value option missing its value yields invalid_option", async () => {
    const result = await runCli(["ask", "--provider"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("error [invalid_option]");
  });

  test("an undeclared option yields a JSON invalid_option envelope", async () => {
    const result = await runCli(["ask", "do something", "--bogus", "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(payload).toEqual({
      ok: false,
      version: "1",
      command: "ask",
      error: {
        code: "invalid_option",
        message: 'Unknown option "--bogus".',
        details: { option: "--bogus", reason: "unknown" },
      },
    });
  });

  test("missing command input yields a JSON invalid_usage envelope", async () => {
    const result = await runCli(["ask", "--json"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(payload).toEqual({
      ok: false,
      version: "1",
      command: "ask",
      error: {
        code: "invalid_usage",
        message: "Missing required argument <command>.",
        details: { argument: "command" },
      },
    });
  });

  test("a command failure yields a JSON execution_failed envelope", async () => {
    const result = await runCli(["setup", "--json", "--", "invalid"]);
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(payload).toEqual({
      ok: false,
      version: "1",
      command: "setup",
      error: {
        code: "execution_failed",
        message: 'Unknown client "invalid". Use: maya setup [claude|codex]',
        details: { stderr: 'Unknown client "invalid". Use: maya setup [claude|codex]' },
      },
    });
  });
});

describe("S6 — capabilities snapshot", () => {
  test("maya capabilities is a deterministic, versioned registry contract", async () => {
    const first = await runCli(["capabilities", "--json"]);
    const second = await runCli(["capabilities", "--json"]);
    const payload = JSON.parse(first.stdout);

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(second.stdout).toBe(first.stdout);
    expect(payload).toEqual({
      ok: true,
      version: "1",
      command: "capabilities",
      data: expectedCapabilities,
    });
  });
});
