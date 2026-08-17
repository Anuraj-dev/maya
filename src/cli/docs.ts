import { renameSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateDocsIndex, type CatalogEntry } from "../docs-index/validate.ts";
import { executionFailed, invalidUsage } from "./errors.ts";
import { docsIndexRoot } from "./docs-root.ts";
import type { CommandResult, CommandSpec } from "./types.ts";

const DEFAULT_LIMIT = 10;

function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  const text = String(value);
  if (!/^\d+$/.test(text) || Number(text) < 1) {
    throw invalidUsage('Option "--limit" must be a positive integer.', { option: "--limit", value });
  }
  return Number(text);
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function indexedDocPaths(index: ReturnType<typeof validateDocsIndex>): string[] {
  const paths = new Set<string>();
  for (const entry of [...index.files, ...index.tools, ...index.commands]) {
    if (entry.relatedDocsPath) paths.add(entry.relatedDocsPath);
    if (entry.filePath?.endsWith(".md")) paths.add(entry.filePath);
  }
  return [...paths].sort();
}

export async function runDocsQuery(query: string, limitValue?: unknown): Promise<CommandResult> {
  const root = docsIndexRoot();
  const index = validateDocsIndex(root, []);
  const limit = parseLimit(limitValue);
  const needle = normalized(query);
  if (!needle) throw invalidUsage("Documentation query must contain a non-whitespace character.");
  const matches: Array<{ path: string; line: number; text: string }> = [];

  for (const path of indexedDocPaths(index)) {
    const lines = readFileSync(join(root, path), "utf8").split(/\r?\n/);
    for (let offset = 0; offset < lines.length; offset += 1) {
      const text = lines[offset]!.trim();
      if (text && normalized(text).includes(needle)) {
        matches.push({ path, line: offset + 1, text });
      }
    }
  }

  matches.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.text.localeCompare(b.text));
  const results = matches.slice(0, limit);
  const truncated = matches.length > results.length;
  const text = matches.length === 0
    ? `No documentation matches for "${query}".`
    : [
      ...results.map((match) => `${match.path}:${match.line}  ${match.text}`),
      truncated
        ? `${results.length} of ${matches.length} matches for "${query}"\n…[truncated to ${results.length} matches]`
        : `${matches.length} matches for "${query}"`,
    ].join("\n");

  return {
    text,
    data: { query, limit, total: matches.length, truncated, results },
  };
}

function canonicalCatalog(
  name: "files" | "tools" | "commands",
  description: string,
  entries: CatalogEntry[],
): string {
  return `${JSON.stringify({ schemaVersion: 1, description, [name]: entries }, null, 2)}\n`;
}

export async function runDocsIndex(checkOnly: boolean): Promise<CommandResult> {
  const root = docsIndexRoot();
  try {
    let registeredTools: Array<{ name: string; dependencyGated: boolean }> = [];
    let registeredCommands: string[] = [];
    if (process.env.MAYA_DOCS_INDEX_ROOT === undefined) {
      const [{ listCliToolSpecs }, { COMMAND_SPECS }] = await Promise.all([
        import("./tool.ts"),
        import("./specs.ts"),
      ]);
      registeredTools = (await listCliToolSpecs()).map((tool) => ({
        name: tool.name,
        dependencyGated: false,
      }));
      registeredCommands = COMMAND_SPECS.map((spec) => spec.path.join(" "));
    }
    const index = validateDocsIndex(root, registeredTools, registeredCommands);
    const names = ["files", "tools", "commands"] as const;
    let changed = false;
    if (!checkOnly) {
      const pending: Array<{ path: string; temporaryPath: string; content: string }> = [];
      for (const name of names) {
        const path = join(root, "docs-index", `${name}.json`);
        const raw = readFileSync(path, "utf8");
        const current = JSON.parse(raw) as { description: string };
        const content = canonicalCatalog(name, current.description, index[name]);
        if (content !== raw) {
          pending.push({ path, temporaryPath: `${path}.${process.pid}.tmp`, content });
        }
      }
      for (const entry of pending) writeFileSync(entry.temporaryPath, entry.content);
      for (const entry of pending) renameSync(entry.temporaryPath, entry.path);
      changed = pending.length > 0;
    }
    const counts = Object.fromEntries(names.map((name) => [name, index[name].length]));
    return {
      text: checkOnly
        ? `Docs index valid: ${counts.files} files, ${counts.tools} tools, ${counts.commands} commands.`
        : `Docs index ${changed ? "regenerated" : "already canonical"}: ${counts.files} files, ${counts.tools} tools, ${counts.commands} commands.`,
      data: { valid: true, changed, schemaVersion: index.schemaVersion, counts },
    };
  } catch (error) {
    throw executionFailed(error instanceof Error ? error.message : String(error));
  }
}

export const DOC_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ["docs", "query"],
    category: "discovery",
    summary: "Search curated Maya documentation with bounded output.",
    description: "Search indexed Markdown content deterministically without an LLM or repository crawl.",
    args: [{ name: "query", required: true, variadic: true }],
    options: [{
      long: "--limit",
      type: "string",
      description: "Return at most this many matching lines (default 10).",
    }],
    run: async ({ args, values }) => runDocsQuery(args.join(" "), values.limit),
  },
  {
    path: ["docs", "index"],
    category: "discovery",
    summary: "Validate or canonically regenerate docs-index catalogs.",
    description: "Validate schemas, ordering, uniqueness, and repository paths; omit --check to rewrite canonical JSON while preserving curated fields.",
    options: [{
      long: "--check",
      type: "boolean",
      description: "Validate without writing catalog files.",
      defaultValue: false,
    }],
    run: async ({ values }) => runDocsIndex(values.check === true),
  },
];
