import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RegisteredTool {
  name: string;
  dependencyGated: boolean;
}

interface CatalogEntry {
  name: string;
  filePath?: string | null;
  relatedDocsPath?: string | null;
  dependencyGated?: boolean;
}

interface Catalog {
  schemaVersion: number;
  [collection: string]: unknown;
}

export interface DocsIndex {
  schemaVersion: number;
  files: CatalogEntry[];
  tools: CatalogEntry[];
  commands: CatalogEntry[];
}

function readCatalog(
  rootDir: string,
  name: "files" | "tools" | "commands",
): { schemaVersion: number; entries: CatalogEntry[] } {
  const path = join(rootDir, "docs-index", `${name}.json`);
  const catalog = JSON.parse(readFileSync(path, "utf8")) as Catalog;
  if (!Number.isInteger(catalog.schemaVersion) || catalog.schemaVersion < 1) {
    throw new Error(`${name}.json has an invalid schemaVersion`);
  }
  const entries = catalog[name];
  if (!Array.isArray(entries)) throw new Error(`${name}.json must contain a ${name} array`);
  return { schemaVersion: catalog.schemaVersion, entries: entries as CatalogEntry[] };
}

function assertUnique(name: string, entries: CatalogEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.name)) throw new Error(`${name}.json contains duplicate name: ${entry.name}`);
    seen.add(entry.name);
  }
}

function assertSorted(name: string, entries: CatalogEntry[]): void {
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1]!.name > entries[index]!.name) {
      throw new Error(`${name}.json entries must be sorted by name`);
    }
  }
}

function assertPaths(rootDir: string, entries: CatalogEntry[]): void {
  for (const entry of entries) {
    for (const field of ["filePath", "relatedDocsPath"] as const) {
      const path = entry[field];
      if (path && !existsSync(join(rootDir, path))) {
        throw new Error(`${entry.name} references missing path: ${path}`);
      }
    }
  }
}

export function validateDocsIndex(rootDir: string, registeredTools: RegisteredTool[] = []): DocsIndex {
  const fileCatalog = readCatalog(rootDir, "files");
  const toolCatalog = readCatalog(rootDir, "tools");
  const commandCatalog = readCatalog(rootDir, "commands");
  const versions = [fileCatalog.schemaVersion, toolCatalog.schemaVersion, commandCatalog.schemaVersion];
  if (!versions.every((version) => version === versions[0])) {
    throw new Error("docs-index catalogs must use the same schemaVersion");
  }

  const catalogs = [
    ["files", fileCatalog.entries],
    ["tools", toolCatalog.entries],
    ["commands", commandCatalog.entries],
  ] as const;
  for (const [name, entries] of catalogs) {
    assertUnique(name, entries);
    assertSorted(name, entries);
    assertPaths(rootDir, entries);
  }

  const indexedTools = new Map(toolCatalog.entries.map((tool) => [tool.name, tool]));
  for (const registered of registeredTools) {
    const indexed = indexedTools.get(registered.name);
    if (!indexed) throw new Error(`tools.json is missing registered tool: ${registered.name}`);
    if (Boolean(indexed.dependencyGated) !== registered.dependencyGated) {
      throw new Error(`tools.json has incorrect dependencyGated marker: ${registered.name}`);
    }
  }

  return {
    schemaVersion: versions[0]!,
    files: fileCatalog.entries,
    tools: toolCatalog.entries,
    commands: commandCatalog.entries,
  };
}
