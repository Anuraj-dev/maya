/**
 * Audit + reversibility — Maya's safety model for a full-access Jarvis.
 *
 * The old model was a confirmation GATE that the driving agent could simply talk (or, over
 * MCP, `confirm:true`) its way past. We replace it with two cheaper, harder-to-fool guarantees:
 *
 *   1. AUDIT  — every tool call is appended to ~/.config/maya/audit/log.jsonl (append-only),
 *               so there is always a record of what Maya did, win or fail.
 *   2. UNDO   — destructive file ops are made reversible: file_delete moves to a trash dir
 *               instead of unlinking, and file_write snapshots the previous contents before
 *               overwriting. Each reversible op pushes onto an undo stack the `undo` tool pops.
 *
 * Hard gating is kept ONLY for the genuinely irreversible-and-costly category (payments).
 * Everything else runs, but is logged and (where it touches files) recoverable.
 */
import { existsSync, mkdirSync } from "node:fs";
import { copyFile, rename, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { MAYA_DIR } from "../config/index.ts";

const AUDIT_DIR = join(MAYA_DIR, "audit");
const AUDIT_LOG = join(AUDIT_DIR, "log.jsonl");
const UNDO_STACK = join(AUDIT_DIR, "undo.json");
const TRASH_DIR = join(MAYA_DIR, "trash");
const SNAP_DIR = join(MAYA_DIR, "snapshots");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// ---------------------------------------------------------------------------
// Audit log (append-only)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  ts: string;
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  summary: string;
}

/** Append one line to the audit log. Best-effort: auditing must never break a tool call. */
export async function logAction(
  tool: string,
  input: Record<string, unknown>,
  ok: boolean,
  summary: string,
): Promise<void> {
  try {
    ensureDir(AUDIT_DIR);
    const entry: AuditEntry = { ts: new Date().toISOString(), tool, input, ok, summary: summary.slice(0, 500) };
    const prev = existsSync(AUDIT_LOG) ? await readFile(AUDIT_LOG, "utf8") : "";
    await writeFile(AUDIT_LOG, prev + JSON.stringify(entry) + "\n");
  } catch {
    /* never let auditing throw into a tool call */
  }
}

// ---------------------------------------------------------------------------
// Undo stack (LIFO of reversible actions)
// ---------------------------------------------------------------------------

type UndoEntry =
  | { kind: "restore-trashed"; trashedPath: string; originalPath: string; ts: string }
  | { kind: "restore-snapshot"; snapshotPath: string; originalPath: string; ts: string };

async function loadUndo(): Promise<UndoEntry[]> {
  if (!existsSync(UNDO_STACK)) return [];
  try {
    return JSON.parse(await readFile(UNDO_STACK, "utf8")) as UndoEntry[];
  } catch {
    return [];
  }
}

async function saveUndo(stack: UndoEntry[]): Promise<void> {
  ensureDir(AUDIT_DIR);
  await writeFile(UNDO_STACK, JSON.stringify(stack, null, 2));
}

async function push(entry: UndoEntry): Promise<void> {
  const stack = await loadUndo();
  stack.push(entry);
  await saveUndo(stack);
}

// ---------------------------------------------------------------------------
// Reversible file operations
// ---------------------------------------------------------------------------

/**
 * Move a file to the trash dir instead of deleting it, and record an undo entry.
 * Returns the trash path so callers can tell the user where it went.
 */
export async function trashFile(path: string): Promise<string> {
  ensureDir(TRASH_DIR);
  const trashedPath = join(TRASH_DIR, `${basename(path)}.${stamp()}`);
  await rename(path, trashedPath);
  await push({ kind: "restore-trashed", trashedPath, originalPath: path, ts: new Date().toISOString() });
  return trashedPath;
}

/**
 * Snapshot a file's current contents before it is overwritten, and record an undo entry.
 * No-op (returns null) if the path doesn't exist yet (nothing to lose).
 */
export async function snapshotFile(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  ensureDir(SNAP_DIR);
  const snapshotPath = join(SNAP_DIR, `${basename(path)}.${stamp()}`);
  await copyFile(path, snapshotPath);
  await push({ kind: "restore-snapshot", snapshotPath, originalPath: path, ts: new Date().toISOString() });
  return snapshotPath;
}

/** Pop the most recent reversible action and reverse it. Returns a human description. */
export async function undoLast(): Promise<string> {
  const stack = await loadUndo();
  const entry = stack.pop();
  if (!entry) return "Nothing to undo — no reversible actions on record.";
  await saveUndo(stack);

  try {
    if (entry.kind === "restore-trashed") {
      if (!existsSync(entry.trashedPath)) return `Cannot undo: trashed file is gone (${entry.trashedPath}).`;
      await rename(entry.trashedPath, entry.originalPath);
      return `Restored ${entry.originalPath} from trash.`;
    }
    // restore-snapshot
    if (!existsSync(entry.snapshotPath)) return `Cannot undo: snapshot is gone (${entry.snapshotPath}).`;
    await copyFile(entry.snapshotPath, entry.originalPath);
    return `Reverted ${entry.originalPath} to its previous contents.`;
  } catch (err) {
    return `Undo failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
