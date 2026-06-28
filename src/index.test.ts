import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const entry = join(import.meta.dir, "index.ts");
const tempHome = join(tmpdir(), `maya-cli-test-${process.pid}`);

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
});

describe("S6 — capabilities snapshot", () => {
  test("maya capabilities is deterministic and includes the registered commands", async () => {
    const result = await runCli(["capabilities"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("maya ask");
    expect(result.stdout).toContain("maya capabilities");
    expect(result.stdout).toContain("maya mcp");
  });
});
