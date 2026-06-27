/**
 * Enforced-execution wrapper (ADR 0005 / issue #22).
 *
 * Every tool call — regardless of caller (MCP, CLI, daemon) — MUST go through runTool.
 * It is the single point where the four safety invariants are applied before any executor runs:
 *
 *   1. Payment hard-gate  — payment tools require confirm:true or the call is rejected.
 *   2. Catastrophic-shell gate — unrecoverable shell commands require confirm:true.
 *   3. Audit logging      — every call (allowed or blocked) is appended to the audit log.
 *   4. Undo-snapshotting  — file executors call trashFile/snapshotFile internally; they remain
 *                           undoable when reached through this wrapper.
 *
 * Registry executors stay pure (no safety logic). Callers (MCP, CLI) add only output formatting.
 */

import type { MayaTool } from "../tools/index.ts";
import { classify } from "../safety/floor.ts";
import { classifyCatastrophic } from "../safety/catastrophic.ts";
import { logAction } from "../safety/audit.ts";

export interface RunToolResult {
  ok: boolean;
  text: string;
  isError: boolean;
}

/**
 * Execute `name` with `input` against the provided `tools` registry after applying all safety
 * checks. Returns a structured result; callers translate it to their own output format.
 */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  tools: Record<string, MayaTool>,
): Promise<RunToolResult> {
  const tool = tools[name];
  if (!tool) {
    return { ok: false, text: `Unknown tool: ${name}`, isError: true };
  }

  // Gate 1 — payments: a charge is neither auditable-away nor undoable.
  const verdict = classify({ name, input });
  if (verdict.category === "payment" && input.confirm !== true) {
    await logAction(name, input, false, "blocked: payment needs confirm:true");
    return {
      ok: false,
      text:
        `⚠️  This is a payment (${verdict.reason}) and is the one action Maya will not take on her own. ` +
        `Confirm with Raja, then call "${name}" again with confirm:true.`,
      isError: true,
    };
  }

  // Gate 2 — catastrophic shell: unrecoverable commands (wipe-home, mkfs, curl|sh, fork-bomb…).
  if (name === "shell_run") {
    const cat = classifyCatastrophic(String(input.command ?? ""));
    if (cat.catastrophic && input.confirm !== true) {
      await logAction(name, input, false, `blocked: catastrophic shell (${cat.pattern})`);
      return {
        ok: false,
        text:
          `⚠️  This command is catastrophic (${cat.reason}) and is unrecoverable — not trash, not undoable. ` +
          `Confirm with Raja, then call "shell_run" again with confirm:true.`,
        isError: true,
      };
    }
  }

  try {
    const result = await tool.execute(input);
    await logAction(name, input, true, result);
    return { ok: true, text: result, isError: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAction(name, input, false, msg);
    return { ok: false, text: `Tool "${name}" failed: ${msg}`, isError: true };
  }
}
