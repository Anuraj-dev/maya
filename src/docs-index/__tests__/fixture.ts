import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type DocsIndexCatalogName = "files" | "tools" | "commands";

export const VALID_INDEX_ENTRIES = {
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

export interface DocsIndexFixture {
  root: string;
  cleanup(): void;
}

export function createDocsIndexFixture(
  overrides: Partial<Record<DocsIndexCatalogName, unknown[]>> = {},
  schemaVersion = 1,
): DocsIndexFixture {
  const root = mkdtempSync(join(tmpdir(), "maya-docs-index-"));
  mkdirSync(join(root, "docs-index"));
  writeFileSync(join(root, "exists.ts"), "");

  for (const name of ["files", "tools", "commands"] as const) {
    const entries = overrides[name] ?? VALID_INDEX_ENTRIES[name];
    writeFileSync(join(root, "docs-index", `${name}.json`), JSON.stringify({
      schemaVersion,
      description: `${name} fixture`,
      [name]: entries,
    }));
  }

  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
