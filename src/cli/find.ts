import { validateDocsIndex } from "../docs-index/validate.ts";
import { invalidUsage } from "./errors.ts";
import type { CommandResult } from "./types.ts";

const DEFAULT_LIMIT = 10;
const FIND_TYPES = ["file", "tool", "doc", "command"] as const;

type FindType = typeof FIND_TYPES[number];

interface FindEntry {
  type: FindType;
  name: string;
  path: string;
  reason: string;
  strongSearchText: string[];
  weakSearchText: string[];
}

interface FindResult {
  type: FindType;
  name: string;
  path: string;
  reason: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;

  const text = String(value);
  if (!/^\d+$/.test(text)) {
    throw invalidUsage('Option "--limit" must be a positive integer.', { option: "--limit", value });
  }

  const parsed = Number.parseInt(text, 10);
  if (parsed < 1) {
    throw invalidUsage('Option "--limit" must be a positive integer.', { option: "--limit", value });
  }

  return parsed;
}

function parseType(value: unknown): FindType | null {
  if (value === undefined) return null;

  const parsed = String(value) as FindType;
  if (!FIND_TYPES.includes(parsed)) {
    throw invalidUsage('Option "--type" must be one of: file, tool, doc, command.', {
      option: "--type",
      value,
    });
  }

  return parsed;
}

function buildDocEntries(index: ReturnType<typeof validateDocsIndex>): FindEntry[] {
  const docs = new Map<string, {
    keywords: Set<string>;
    categories: Set<string>;
    names: Set<string>;
  }>();

  for (const collection of [index.files, index.tools, index.commands]) {
    for (const entry of collection) {
      const path = entry.relatedDocsPath ?? entry.filePath;
      if (!path) continue;

      const current = docs.get(path) ?? {
        keywords: new Set<string>(),
        categories: new Set<string>(),
        names: new Set<string>(),
      };

      current.names.add(entry.name);
      current.categories.add(entry.category);
      for (const keyword of entry.keywords ?? []) current.keywords.add(keyword);
      docs.set(path, current);
    }
  }

  return [...docs.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([path, meta]) => ({
      type: "doc" as const,
      name: path,
      path,
      reason: `Use for ${[...meta.categories].sort().join(", ")} context.`,
      strongSearchText: [
        path,
        ...[...meta.names],
        ...[...meta.categories],
        ...[...meta.keywords],
      ],
      weakSearchText: [],
    }));
}

function buildFindEntries(rootDir: string): FindEntry[] {
  const index = validateDocsIndex(rootDir, []);

  const files = index.files.map((entry) => ({
    type: "file" as const,
    name: entry.name,
    path: entry.filePath!,
    reason: entry.whenToUse,
    strongSearchText: [
      entry.name,
      entry.filePath!,
      entry.relatedDocsPath,
      entry.relatedMcpTool,
      entry.futureCliCommand,
      ...entry.keywords,
    ].filter((value): value is string => Boolean(value)),
    weakSearchText: [entry.category, entry.description, entry.whenToUse],
  }));

  const tools = index.tools.map((entry) => ({
    type: "tool" as const,
    name: entry.name,
    path: entry.filePath!,
    reason: entry.whenToUse,
    strongSearchText: [
      entry.name,
      entry.filePath!,
      entry.relatedDocsPath,
      entry.mcpTool,
      entry.futureCliCommand,
      ...entry.keywords,
    ].filter((value): value is string => Boolean(value)),
    weakSearchText: [entry.category, entry.description, entry.whenToUse],
  }));

  const commands = index.commands.map((entry) => ({
    type: "command" as const,
    name: entry.name,
    path: entry.filePath ?? entry.relatedDocsPath!,
    reason: entry.whenToUse,
    strongSearchText: [
      entry.name,
      entry.filePath,
      entry.relatedDocsPath,
      ...entry.keywords,
    ].filter((value): value is string => Boolean(value)),
    weakSearchText: [entry.category, entry.description, entry.whenToUse],
  }));

  return [...files, ...tools, ...commands, ...buildDocEntries(index)];
}

function typeRank(type: FindType): number {
  return {
    tool: 0,
    file: 1,
    command: 2,
    doc: 3,
  }[type];
}

function findTier(query: string, entry: FindEntry): number | null {
  const exactName = normalize(entry.name) === query;
  if (exactName) return 0;

  const prefixName = normalize(entry.name).startsWith(query);
  if (prefixName) return 1;

  const strongNameOrPathMatch = [entry.name, entry.path].some((value) => normalize(value).includes(query));
  if (strongNameOrPathMatch) return 2;

  const strongMatch = entry.strongSearchText.some((value) => normalize(value).includes(query));
  if (strongMatch) return 3;

  const weakMatch = entry.weakSearchText.some((value) => normalize(value).includes(query));
  return weakMatch ? 4 : null;
}

function searchEntries(
  entries: FindEntry[],
  query: string,
  type: FindType | null,
  limit: number,
): { total: number; truncated: boolean; results: FindResult[] } {
  const normalizedQuery = normalize(query);
  const ranked = entries
    .filter((entry) => type === null || entry.type === type)
    .map((entry) => ({ entry, tier: findTier(normalizedQuery, entry) }))
    .filter((candidate): candidate is { entry: FindEntry; tier: number } => candidate.tier !== null)
    .sort((a, b) =>
      a.tier - b.tier
      || typeRank(a.entry.type) - typeRank(b.entry.type)
      || a.entry.name.localeCompare(b.entry.name)
      || a.entry.path.localeCompare(b.entry.path)
      || a.entry.type.localeCompare(b.entry.type))
    .map(({ entry }) => ({
      type: entry.type,
      name: entry.name,
      path: entry.path,
      reason: entry.reason,
    }));

  return {
    total: ranked.length,
    truncated: ranked.length > limit,
    results: ranked.slice(0, limit),
  };
}

function renderFindText(query: string, results: FindResult[], total: number, truncated: boolean): string {
  if (total === 0) return `No results for "${query}".`;

  const lines = results.map((entry) => `${entry.type}  ${entry.name}  ${entry.path}  ${entry.reason}`);
  lines.push(
    truncated
      ? `${results.length} of ${total} results for "${query}"`
      : `${total} results for "${query}"`,
  );
  if (truncated) lines.push(`…[truncated to ${results.length} results]`);
  return lines.join("\n");
}

export async function runFindCommand(
  query: string,
  options: { type?: unknown; limit?: unknown } = {},
): Promise<CommandResult> {
  const type = parseType(options.type);
  const limit = parseLimit(options.limit);
  const rootDir = process.env.MAYA_DOCS_INDEX_ROOT ?? process.cwd();
  const entries = buildFindEntries(rootDir);
  const { results, total, truncated } = searchEntries(entries, query, type, limit);

  return {
    text: renderFindText(query, results, total, truncated),
    data: {
      query,
      type,
      limit,
      total,
      truncated,
      results,
    },
  };
}
