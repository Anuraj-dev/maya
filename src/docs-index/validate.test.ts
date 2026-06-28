import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigSchema } from "../config/index.ts";
import { buildTools } from "../tools/index.ts";
import { validateDocsIndex, type RegisteredTool } from "./validate.ts";

const roots: string[] = [];

function fixture(overrides: Partial<Record<"files" | "tools" | "commands", unknown[]>> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "maya-docs-index-"));
  roots.push(root);
  mkdirSync(join(root, "docs-index"));
  writeFileSync(join(root, "exists.ts"), "");
  for (const name of ["files", "tools", "commands"] as const) {
    const entries = overrides[name] ?? [{ name: `${name}-entry`, filePath: "exists.ts" }];
    writeFileSync(join(root, "docs-index", `${name}.json`), JSON.stringify({ schemaVersion: 1, [name]: entries }));
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("docs-index validation", () => {
  test("a valid index exposes its shared schema version", () => {
    expect(validateDocsIndex(fixture()).schemaVersion).toBe(1);
  });

  test("duplicate tool and command names are rejected", () => {
    const duplicate = [{ name: "same" }, { name: "same" }];
    expect(() => validateDocsIndex(fixture({ tools: duplicate }))).toThrow("duplicate name: same");
    expect(() => validateDocsIndex(fixture({ commands: duplicate }))).toThrow("duplicate name: same");
  });

  test("every referenced repository path must exist", () => {
    const root = fixture({ files: [{ name: "missing", relatedDocsPath: "docs/missing.md" }] });
    expect(() => validateDocsIndex(root)).toThrow("references missing path: docs/missing.md");
  });

  test("the tool catalog covers buildTools and marks dependency-gated tools", () => {
    const config = ConfigSchema.parse({});
    const base = new Set(Object.keys(buildTools(config)));
    const complete = Object.keys(buildTools(config, {
      voiceAsk: async () => "",
      reminders: {} as never,
      processes: {} as never,
    }));
    const registered: RegisteredTool[] = complete.map((name) => ({
      name,
      dependencyGated: !base.has(name),
    }));
    const root = join(import.meta.dir, "../..");

    expect(() => validateDocsIndex(root, registered)).not.toThrow();
  });

  test("catalog entries must use deterministic name ordering", () => {
    const root = fixture({ commands: [{ name: "zeta" }, { name: "alpha" }] });
    expect(() => validateDocsIndex(root)).toThrow("commands.json entries must be sorted by name");
  });
});
