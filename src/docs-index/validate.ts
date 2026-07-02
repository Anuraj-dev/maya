import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export interface RegisteredTool {
  name: string;
  dependencyGated: boolean;
}

export interface CatalogEntry {
  name: string;
  category: string;
  description: string;
  filePath?: string | null;
  relatedDocsPath?: string | null;
  keywords: string[];
  whenToUse: string;
  dependencyGated?: boolean;
  relatedMcpTool?: string | null;
  futureCliCommand?: string | null;
  mcpTool?: string | null;
}

const CommonEntrySchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  filePath: z.string().min(1).nullable(),
  relatedDocsPath: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  whenToUse: z.string().min(1),
});

const FileEntrySchema = CommonEntrySchema.extend({
  filePath: z.string().min(1),
  relatedMcpTool: z.string().min(1).nullable(),
  futureCliCommand: z.string().min(1).nullable(),
}).strict();

const ToolEntrySchema = CommonEntrySchema.extend({
  filePath: z.string().min(1),
  mcpTool: z.string().min(1).nullable(),
  futureCliCommand: z.string().min(1).nullable(),
  dependencyGated: z.boolean().optional(),
}).strict();

const CommandEntrySchema = CommonEntrySchema.extend({
  status: z.enum(["implemented", "planned"]),
}).strict();

const CatalogSchemas = {
  files: z.object({
    schemaVersion: z.literal(1),
    description: z.string().min(1),
    files: z.array(FileEntrySchema),
  }).strict(),
  tools: z.object({
    schemaVersion: z.literal(1),
    description: z.string().min(1),
    tools: z.array(ToolEntrySchema),
  }).strict(),
  commands: z.object({
    schemaVersion: z.literal(1),
    description: z.string().min(1),
    commands: z.array(CommandEntrySchema),
  }).strict(),
};

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
  const parsed = CatalogSchemas[name].safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${name}.json schema validation failed at ${issue?.path.join(".") || "root"}`);
  }
  const data = parsed.data as Record<string, unknown>;
  return { schemaVersion: 1, entries: data[name] as CatalogEntry[] };
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

export function validateDocsIndex(rootDir: string, registeredTools: RegisteredTool[]): DocsIndex {
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
