/**
 * Retention for trash / snapshots and a bounded undo stack (production decision W4.5).
 *
 * Today undo.json grows without limit, trash/ and snapshots/ are never cleaned, and a stray
 * "undo" can reach back to an unrelated op from days ago. These pure helpers give the audit
 * module the two policies it needs:
 *
 *   selectExpired  — which backing files are old enough to garbage-collect
 *   boundUndoStack — keep only the most-recent N undo entries, report what was evicted
 *
 * Pure — no fs calls — so retention policy is unit-testable independent of the disk (see test).
 */

export interface BackingFile {
  /** File name (or path) — returned so the caller can unlink it. */
  name: string;
  /** Last-modified time in epoch ms. */
  mtimeMs: number;
}

const DAY_MS = 86_400_000;

/**
 * Return the names of files older than `maxAgeDays` relative to `now`. A file exactly at the
 * boundary is kept (strictly-greater-than test), so retention is forgiving.
 */
export function selectExpired(files: readonly BackingFile[], now: number, maxAgeDays: number): string[] {
  const maxAgeMs = maxAgeDays * DAY_MS;
  return files.filter((f) => now - f.mtimeMs > maxAgeMs).map((f) => f.name);
}

/**
 * Bound an undo stack (oldest-first) to `maxDepth` most-recent entries. Returns the kept tail and
 * the evicted head so the caller can delete the evicted entries' snapshot/trash files too.
 */
export function boundUndoStack<T>(stack: readonly T[], maxDepth: number): { kept: T[]; evicted: T[] } {
  if (maxDepth <= 0) return { kept: [], evicted: [...stack] };
  if (stack.length <= maxDepth) return { kept: [...stack], evicted: [] };
  const cut = stack.length - maxDepth;
  return { evicted: stack.slice(0, cut), kept: stack.slice(cut) };
}
