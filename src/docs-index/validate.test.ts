import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ConfigSchema } from "../config/index.ts";
import { buildTools } from "../tools/index.ts";
import {
  createDocsIndexFixture,
  type DocsIndexFixture,
  VALID_INDEX_ENTRIES,
} from "./__tests__/fixture.ts";
import { validateDocsIndex, type RegisteredTool } from "./validate.ts";

const fixtures: DocsIndexFixture[] = [];

function fixture(
  overrides: Partial<Record<"files" | "tools" | "commands", unknown[]>> = {},
  schemaVersion = 1,
): string {
  const created = createDocsIndexFixture(overrides, schemaVersion);
  fixtures.push(created);
  return created.root;
}

afterEach(() => {
  for (const created of fixtures.splice(0)) created.cleanup();
});

describe("docs-index validation", () => {
  test("a valid index exposes its shared schema version", () => {
    expect(validateDocsIndex(fixture(), [])).toHaveProperty("schemaVersion", 1);
  });

  test("unsupported versions and malformed entries are rejected", () => {
    expect(() => validateDocsIndex(fixture({}, 2), [])).toThrow("schema validation failed");
    const malformed = [{ ...VALID_INDEX_ENTRIES.files[0]!, category: 42 }];
    expect(() => validateDocsIndex(fixture({ files: malformed }), [])).toThrow("files.json schema validation failed");
  });

  test("duplicate tool and command names are rejected", () => {
    const duplicateTools = VALID_INDEX_ENTRIES.tools.map((entry) => ({ ...entry, name: "same" }));
    duplicateTools.push({ ...duplicateTools[0]! });
    const duplicateCommands = VALID_INDEX_ENTRIES.commands.map((entry) => ({ ...entry, name: "same" }));
    duplicateCommands.push({ ...duplicateCommands[0]! });
    expect(() => validateDocsIndex(fixture({ tools: duplicateTools }), [])).toThrow("duplicate name: same");
    expect(() => validateDocsIndex(fixture({ commands: duplicateCommands }), [])).toThrow("duplicate name: same");
  });

  test("every referenced repository path must exist", () => {
    const missing = [{ ...VALID_INDEX_ENTRIES.files[0]!, relatedDocsPath: "docs/missing.md" }];
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

  test("registered CLI commands must exist and be marked implemented", () => {
    const root = fixture();
    expect(() => validateDocsIndex(root, [], ["missing"])).toThrow(
      "commands.json is missing registered command: missing",
    );
    expect(() => validateDocsIndex(root, [], ["commands-entry"])).toThrow(
      "commands.json marks registered command as planned: commands-entry",
    );
  });

  test("catalog entries must use deterministic name ordering", () => {
    const commands = [
      { ...VALID_INDEX_ENTRIES.commands[0]!, name: "zeta" },
      { ...VALID_INDEX_ENTRIES.commands[0]!, name: "alpha" },
    ];
    expect(() => validateDocsIndex(fixture({ commands }), [])).toThrow("commands.json entries must be sorted by name");
  });
});
