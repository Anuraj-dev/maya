import { expect, test, describe } from "bun:test";
import { selectExpired, boundUndoStack } from "./retention.ts";

const DAY = 86_400_000;

describe("trash/snapshot retention (W4.5)", () => {
  const now = 100 * DAY;

  test("selects files older than the window, keeps fresh and boundary files", () => {
    const files = [
      { name: "old.txt", mtimeMs: now - 10 * DAY },
      { name: "fresh.txt", mtimeMs: now - 1 * DAY },
      { name: "exactly7.txt", mtimeMs: now - 7 * DAY }, // boundary: kept
    ];
    expect(selectExpired(files, now, 7)).toEqual(["old.txt"]);
  });

  test("empty input yields nothing to GC", () => {
    expect(selectExpired([], now, 7)).toEqual([]);
  });
});

describe("bounded undo stack (W4.5)", () => {
  test("keeps the most-recent N, evicts the oldest", () => {
    const stack = ["a", "b", "c", "d", "e"]; // oldest → newest
    const { kept, evicted } = boundUndoStack(stack, 3);
    expect(kept).toEqual(["c", "d", "e"]);
    expect(evicted).toEqual(["a", "b"]);
  });

  test("a stack within the limit is untouched", () => {
    const { kept, evicted } = boundUndoStack(["a", "b"], 5);
    expect(kept).toEqual(["a", "b"]);
    expect(evicted).toEqual([]);
  });

  test("maxDepth 0 evicts everything", () => {
    const { kept, evicted } = boundUndoStack(["a", "b"], 0);
    expect(kept).toEqual([]);
    expect(evicted).toEqual(["a", "b"]);
  });
});
