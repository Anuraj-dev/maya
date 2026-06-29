import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMayaCli } from "./__tests__/process.ts";

const roots: string[] = [];

function testProfile(): { home: string; mayaDir: string } {
  const home = mkdtempSync(join(tmpdir(), "maya-terminal-cli-"));
  roots.push(home);
  return { home, mayaDir: join(home, "maya-state") };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("terminal/process CLI", () => {
  test("terminal run executes through runTool and appends an audit record", async () => {
    const profile = testProfile();
    const result = await runMayaCli(["terminal", "run", "printf maya-terminal"], {
      home: profile.home,
      env: { MAYA_DIR: profile.mayaDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("maya-terminal\n");
    expect(result.stderr).toBe("");

    const entries = readFileSync(join(profile.mayaDir, "audit", "log.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { tool: string; input: { command?: string }; ok: boolean });
    expect(entries).toContainEqual(expect.objectContaining({
      tool: "shell_run",
      input: expect.objectContaining({ command: "printf maya-terminal" }),
      ok: true,
    }));
  });

  test("terminal run preserves the catastrophic-shell gate", async () => {
    const profile = testProfile();
    const result = await runMayaCli(["terminal", "run", "--", "rm", "-rf", "/"], {
      home: profile.home,
      env: { MAYA_DIR: profile.mayaDir },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("error [execution_failed]");
    expect(result.stderr).toContain("catastrophic");

    const entry = JSON.parse(
      readFileSync(join(profile.mayaDir, "audit", "log.jsonl"), "utf8").trim(),
    ) as { tool: string; ok: boolean; summary: string };
    expect(entry).toEqual(expect.objectContaining({
      tool: "shell_run",
      ok: false,
      summary: expect.stringContaining("blocked: catastrophic shell"),
    }));
  });

  test("terminal run bounds large output and marks truncation explicitly", async () => {
    const profile = testProfile();
    const result = await runMayaCli(["terminal", "run", "yes x | head -c 9000"], {
      home: profile.home,
      env: { MAYA_DIR: profile.mayaDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeLessThan(8_100);
    expect(result.stdout).toContain("…[truncated]");
    expect(result.stderr).toBe("");
  });

  test("proc commands manage one background process across CLI invocations", async () => {
    const profile = testProfile();
    const options = { home: profile.home, env: { MAYA_DIR: profile.mayaDir } };

    const started = await runMayaCli([
      "proc",
      "start",
      "echo process-ready; sleep 5",
      "--name",
      "worker",
      "--json",
    ], options);
    const startedPayload = started.parseEnvelope<{ data: { output: string } }>();
    const id = startedPayload.data.output.match(/\[(p-[a-f0-9-]+)\]/)?.[1];

    expect(started.exitCode).toBe(0);
    expect(id).toBeDefined();

    const listed = await runMayaCli(["proc", "list"], options);
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout).toContain(`[${id}]`);
    expect(listed.stdout).toContain("worker");

    let logs = await runMayaCli(["proc", "logs", id!], options);
    for (let attempt = 0; attempt < 20 && !logs.stdout.includes("process-ready"); attempt += 1) {
      await Bun.sleep(25);
      logs = await runMayaCli(["proc", "logs", id!], options);
    }
    expect(logs.exitCode).toBe(0);
    expect(logs.stdout).toContain("process-ready");

    const stopped = await runMayaCli(["proc", "stop", id!], options);
    expect(stopped.exitCode).toBe(0);
    expect(stopped.stdout).toBe(`Stopped ${id}.\n`);

    const auditedTools = readFileSync(join(profile.mayaDir, "audit", "log.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { tool: string }).tool);
    expect(auditedTools).toEqual(expect.arrayContaining(["proc_start", "proc_list", "proc_logs", "proc_stop"]));
  });

  test("proc logs marks output truncated by the requested line limit", async () => {
    const profile = testProfile();
    const options = { home: profile.home, env: { MAYA_DIR: profile.mayaDir } };
    const started = await runMayaCli(["proc", "start", "seq 1 10", "--json"], options);
    const output = started.parseEnvelope<{ data: { output: string } }>().data.output;
    const id = output.match(/\[(p-[a-f0-9-]+)\]/)?.[1];
    expect(id).toBeDefined();

    let logs = await runMayaCli(["proc", "logs", id!, "--lines", "2"], options);
    for (let attempt = 0; attempt < 20 && !logs.stdout.includes("10"); attempt += 1) {
      await Bun.sleep(25);
      logs = await runMayaCli(["proc", "logs", id!, "--lines", "2"], options);
    }

    expect(logs.exitCode).toBe(0);
    expect(logs.stdout).toBe("…[truncated to last 2 lines]\n9\n10\n");
  });

  test("proc stop reports a TERM-resistant process and preserves force-stop", async () => {
    const profile = testProfile();
    const options = { home: profile.home, env: { MAYA_DIR: profile.mayaDir } };
    const started = await runMayaCli([
      "proc",
      "start",
      "trap '' TERM; while :; do sleep 1; done",
      "--json",
    ], options);
    const output = started.parseEnvelope<{ data: { output: string } }>().data.output;
    const id = output.match(/\[(p-[a-f0-9-]+)\]/)?.[1];
    expect(id).toBeDefined();

    try {
      await Bun.sleep(100);
      const stopped = await runMayaCli(["proc", "stop", id!], options);
      expect(stopped.exitCode).toBe(1);
      expect(stopped.stderr).toContain("still running after SIGTERM");
      expect(stopped.stderr).toContain("--force");

      const forced = await runMayaCli(["proc", "stop", id!, "--force"], options);
      expect(forced.exitCode).toBe(0);
      expect(forced.stdout).toBe(`Stopped ${id}.\n`);
    } finally {
      if (id) await runMayaCli(["proc", "stop", id, "--force"], options);
    }
  });
});
