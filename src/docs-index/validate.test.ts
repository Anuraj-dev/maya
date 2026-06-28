import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigSchema } from "../config/index.ts";
import { buildTools } from "../tools/index.ts";
import { validateDocsIndex, type RegisteredTool } from "./validate.ts";

const roots: string[] = [];

const validEntries = {
  files: [{
    name: "files-entry",
    category: "test",
    description: "Fixture file entry.",
    filePath: "exists.ts",
    relatedDocsPath: "exists.ts",
    relatedMcpTool: null,
    futureCliCommand: null,
    keywords: ["fixture"],
    whenToUse: "Use in tests.",
  }],
  tools: [{
    name: "tools-entry",
    category: "test",
    description: "Fixture tool entry.",
    filePath: "exists.ts",
    relatedDocsPath: "exists.ts",
    mcpTool: "tools-entry",
    futureCliCommand: null,
    keywords: ["fixture"],
    whenToUse: "Use in tests.",
  }],
  commands: [{
    name: "commands-entry",
    category: "test",
    status: "planned",
    description: "Fixture command entry.",
    filePath: null,
    relatedDocsPath: "exists.ts",
    keywords: ["fixture"],
    whenToUse: "Use in tests.",
  }],
};

function fixture(
  overrides: Partial<Record<"files" | "tools" | "commands", unknown[]>> = {},
  schemaVersion = 1,
): string {
  const root = mkdtempSync(join(tmpdir(), "maya-docs-index-"));
  roots.push(root);
  mkdirSync(join(root, "docs-index"));
  writeFileSync(join(root, "exists.ts"), "");
  for (const name of ["files", "tools", "commands"] as const) {
    const entries = overrides[name] ?? validEntries[name];
    writeFileSync(join(root, "docs-index", `${name}.json`), JSON.stringify({
      schemaVersion,
      description: `${name} fixture`,
      [name]: entries,
    }));
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("docs-index validation", () => {
  test("a valid index exposes its shared schema version", () => {
    expect(validateDocsIndex(fixture(), [])).toHaveProperty("schemaVersion", 1);
  });

  test("unsupported versions and malformed entries are rejected", () => {
    expect(() => validateDocsIndex(fixture({}, 2), [])).toThrow("schema validation failed");
    const malformed = [{ ...validEntries.files[0]!, category: 42 }];
    expect(() => validateDocsIndex(fixture({ files: malformed }), [])).toThrow("files.json schema validation failed");
  });

  test("duplicate tool and command names are rejected", () => {
    const duplicateTools = validEntries.tools.map((entry) => ({ ...entry, name: "same" }));
    duplicateTools.push({ ...duplicateTools[0]! });
    const duplicateCommands = validEntries.commands.map((entry) => ({ ...entry, name: "same" }));
    duplicateCommands.push({ ...duplicateCommands[0]! });
    expect(() => validateDocsIndex(fixture({ tools: duplicateTools }), [])).toThrow("duplicate name: same");
    expect(() => validateDocsIndex(fixture({ commands: duplicateCommands }), [])).toThrow("duplicate name: same");
  });

  test("every referenced repository path must exist", () => {
    const missing = [{ ...validEntries.files[0]!, relatedDocsPath: "docs/missing.md" }];
    expect(() => validateDocsIndex(fixture({ files: missing }), [])).toThrow("references missing path: docs/missing.md");
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

  test("missing registered tools and incorrect gate markers are rejected", () => {
    const root = fixture();
    expect(() => validateDocsIndex(root, [{ name: "missing", dependencyGated: false }])).toThrow(
      "missing registered tool: missing",
    );
    expect(() => validateDocsIndex(root, [{ name: "tools-entry", dependencyGated: true }])).toThrow(
      "incorrect dependencyGated marker: tools-entry",
    );
  });

  test("catalog entries must use deterministic name ordering", () => {
    const commands = [
      { ...validEntries.commands[0]!, name: "zeta" },
      { ...validEntries.commands[0]!, name: "alpha" },
    ];
    expect(() => validateDocsIndex(fixture({ commands }), [])).toThrow("commands.json entries must be sorted by name");
  });
});
