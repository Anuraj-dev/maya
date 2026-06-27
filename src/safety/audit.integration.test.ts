/**
 * I/O wiring spec for the audit module (W4.3/W4.4/W4.5). Unlike the pure-core tests, this drives
 * real files under a temp MAYA_DIR to prove the append + redaction + retention wiring holds.
 *
 * MAYA_DIR is bound at module load (config/index.ts), so we set it ONCE before importing audit and
 * clean the per-run subdirs between tests.
 */
import { expect, test, describe, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "maya-audit-"));
const priorMayaDir = process.env.MAYA_DIR;
process.env.MAYA_DIR = dir;

const { logAction, runRetention } = await import("./audit.ts");

const auditDir = join(dir, "audit");
const trashDir = join(dir, "trash");
const logPath = join(auditDir, "log.jsonl");

beforeEach(async () => {
  await rm(auditDir, { recursive: true, force: true });
  await rm(trashDir, { recursive: true, force: true });
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  // Restore the env: MAYA_DIR is now resolved live, so a leaked override would follow other tests.
  if (priorMayaDir === undefined) delete process.env.MAYA_DIR;
  else process.env.MAYA_DIR = priorMayaDir;
});

describe("audit log wiring", () => {
  test("appends one JSON line per call and redacts secrets", async () => {
    await logAction("shell_run", { command: "curl -H 'Authorization: Bearer s3cr3ttoken123' x" }, true, "ok");
    await logAction("file_write", { path: "/tmp/a", content: "password=hunter2" }, true, "wrote");

    const log = await readFile(logPath, "utf8");
    const lines = log.trim().split("\n");
    expect(lines.length).toBe(2);
    for (const l of lines) expect(() => JSON.parse(l)).not.toThrow();
    expect(log).not.toContain("s3cr3ttoken123");
    expect(log).not.toContain("hunter2");
    expect(log).toContain("Bearer"); // prefix preserved, value masked
  });

  test("concurrent writes don't lose lines (append, not read-rewrite)", async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => logAction("noop", { i }, true, `call ${i}`)),
    );
    const log = await readFile(logPath, "utf8");
    expect(log.trim().split("\n").length).toBe(25);
  });
});

describe("retention wiring (W4.5)", () => {
  test("GCs old trash/snapshot files and keeps fresh ones", async () => {
    await mkdir(trashDir, { recursive: true });
    const old = join(trashDir, "old.txt");
    const fresh = join(trashDir, "fresh.txt");
    await writeFile(old, "x");
    await writeFile(fresh, "y");
    // Backdate `old` 30 days.
    const past = Date.now() - 30 * 86_400_000;
    await Bun.spawn(["touch", "-d", new Date(past).toISOString(), old]).exited;

    await runRetention({ maxAgeDays: 14 });

    const left = await readdir(trashDir);
    expect(left).toContain("fresh.txt");
    expect(left).not.toContain("old.txt");
  });
});
