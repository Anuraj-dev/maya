/**
 * Loop/CLI tool-execution path tests (issue #22).
 *
 * Proves that `executeToolViaLoop` preserved the irreversible-action floor (classify +
 * sink.confirm) that the CLI/daemon path requires, while routing confirmed actions through
 * the shared coreRunTool wrapper (audit, payment gate, catastrophic-shell gate).
 *
 *   L1  file_delete triggers sink.confirm (requiresConfirmation = true)
 *   L2  denying the confirmation returns the denied-message and does NOT execute
 *   L3  approving the confirmation executes the tool and returns its result
 *   L4  a non-irreversible tool bypasses sink.confirm entirely
 *   L5  payment_charge is hard-blocked by coreRunTool even after sink.confirm approves
 */

import { expect, test, describe, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MayaTool } from "../tools/index.ts";
import type { MayaSink } from "./loop.ts";
import type { ToolCall } from "../brain/types.ts";

// Pin MAYA_DIR before any module that reads it.
const dir = mkdtempSync(join(tmpdir(), "maya-loop-"));
const priorMayaDir = process.env.MAYA_DIR;
process.env.MAYA_DIR = dir;

const { executeToolViaLoop } = await import("./loop.ts");
const { fileTools } = await import("../tools/file.ts");

const auditDir = join(dir, "audit");

beforeEach(async () => {
  await rm(auditDir, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  if (priorMayaDir === undefined) delete process.env.MAYA_DIR;
  else process.env.MAYA_DIR = priorMayaDir;
});

/** Build a MayaSink that tracks confirm calls and returns a configurable answer. */
function makeSink(confirmAnswer: boolean): { sink: MayaSink; confirmCalled: boolean } {
  const state = { confirmCalled: false };
  const sink: MayaSink = {
    thinking() {},
    say() {},
    toolStart() {},
    toolEnd() {},
    async confirm(_name, _reason, _category) {
      state.confirmCalled = true;
      return confirmAnswer;
    },
    idle() {},
    error() {},
  };
  return { sink, confirmCalled: false };
  // Note: read state.confirmCalled, not the returned object field.
  // The returned object is just for the sink; check state.confirmCalled in tests.
}

/** Spy-aware sink factory that lets tests inspect confirm calls. */
function spySink(confirmAnswer = true): { sink: MayaSink; calls: { confirm: string[] } } {
  const calls = { confirm: [] as string[] };
  const sink: MayaSink = {
    thinking() {},
    say() {},
    toolStart() {},
    toolEnd() {},
    async confirm(name) {
      calls.confirm.push(name);
      return confirmAnswer;
    },
    idle() {},
    error() {},
  };
  return { sink, calls };
}

function makeCall(name: string, input: Record<string, unknown> = {}): ToolCall {
  return { id: "test-1", name, input };
}

function stubTools(name: string, result = "ok"): Record<string, MayaTool> {
  return {
    [name]: {
      spec: { name, description: "", inputSchema: { type: "object", properties: {}, required: [] } },
      execute: async () => result,
    },
  };
}

// ---------------------------------------------------------------------------
// L1 — file_delete triggers sink.confirm
// ---------------------------------------------------------------------------
describe("L1 — irreversible actions trigger sink.confirm", () => {
  test("file_delete calls sink.confirm before executing", async () => {
    const path = join(dir, "l1-target.txt");
    await Bun.write(path, "data");

    const { sink, calls } = spySink(true);
    await executeToolViaLoop(fileTools, makeCall("file_delete", { path }), sink);

    expect(calls.confirm).toContain("file_delete");
  });

  test("file_write with overwrite calls sink.confirm", async () => {
    const path = join(dir, "l1-overwrite.txt");
    await Bun.write(path, "old");

    const { sink, calls } = spySink(true);
    await executeToolViaLoop(fileTools, makeCall("file_write", { path, content: "new", overwrite: true }), sink);

    expect(calls.confirm).toContain("file_write");
  });
});

// ---------------------------------------------------------------------------
// L2 — denied confirmation → no execution, returns denial message
// ---------------------------------------------------------------------------
describe("L2 — denied confirmation stops execution", () => {
  test("denying file_delete returns denial content and does not delete the file", async () => {
    const path = join(dir, "l2-keep.txt");
    await Bun.write(path, "keep me");

    const { sink } = spySink(false);
    const outcome = await executeToolViaLoop(fileTools, makeCall("file_delete", { path }), sink);

    expect(outcome.isError).toBe(false);
    expect(outcome.content).toContain("DENIED");
    expect(await Bun.file(path).exists()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L3 — approved confirmation → tool executes
// ---------------------------------------------------------------------------
describe("L3 — approved confirmation allows execution", () => {
  test("approving file_delete executes and removes the file", async () => {
    const path = join(dir, "l3-delete.txt");
    await Bun.write(path, "bye");

    const { sink } = spySink(true);
    const outcome = await executeToolViaLoop(fileTools, makeCall("file_delete", { path }), sink);

    expect(outcome.isError).toBe(false);
    expect(await Bun.file(path).exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L4 — non-irreversible tool bypasses confirm entirely
// ---------------------------------------------------------------------------
describe("L4 — non-irreversible tools skip sink.confirm", () => {
  test("shell_run with a plain echo does not call sink.confirm", async () => {
    const { sink, calls } = spySink(true);
    await executeToolViaLoop(stubTools("shell_run", "hi"), makeCall("shell_run", { command: "echo hi" }), sink);
    expect(calls.confirm).toHaveLength(0);
  });

  test("file_read never calls sink.confirm", async () => {
    const path = join(dir, "l4-read.txt");
    await Bun.write(path, "content");

    const { sink, calls } = spySink(true);
    await executeToolViaLoop(fileTools, makeCall("file_read", { path }), sink);
    expect(calls.confirm).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// L5 — payment hard-blocked by coreRunTool even after human confirm approves
// ---------------------------------------------------------------------------
describe("L5 — coreRunTool hard-gates still apply after loop confirm", () => {
  test("payment_charge is blocked even when sink.confirm approves", async () => {
    const { sink } = spySink(true);
    const outcome = await executeToolViaLoop(
      stubTools("payment_charge", "charged"),
      makeCall("payment_charge", {}),
      sink,
    );
    // coreRunTool hard-blocks: confirm:true must be in the INPUT, not the UI
    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain("confirm:true");
  });
});
