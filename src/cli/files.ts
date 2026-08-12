import { validateDocsIndex } from "../docs-index/validate.ts";
import { docsIndexRoot } from "./docs-root.ts";
import type { CommandResult, CommandSpec } from "./types.ts";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function runFilesMap(query?: string): Promise<CommandResult> {
  const index = validateDocsIndex(docsIndexRoot(), []);
  const normalizedQuery = query ? normalize(query) : "";
  const files = index.files
    .filter((entry) => !normalizedQuery || [
      entry.name,
      entry.filePath,
      entry.category,
      entry.description,
      entry.whenToUse,
      ...entry.keywords,
    ].some((value) => value && normalize(value).includes(normalizedQuery)))
    .map((entry) => ({
      name: entry.name,
      path: entry.filePath!,
      category: entry.category,
      description: entry.description,
      whenToUse: entry.whenToUse,
    }));

  return {
    text: files.length === 0
      ? `No indexed files${query ? ` for "${query}"` : ""}.`
      : [
        ...files.map((entry) => `${entry.path}  ${entry.description}`),
        `${files.length} indexed ${files.length === 1 ? "file" : "files"}${query ? ` for "${query}"` : ""}`,
      ].join("\n"),
    data: { query: query ?? null, total: files.length, files },
  };
}

export const FILE_COMMAND_SPECS: CommandSpec[] = [{
  path: ["files", "map"],
  category: "discovery",
  summary: "List curated repository files and responsibilities.",
  description: "Read the local files catalog without scanning the repository or starting runtime services.",
  args: [{ name: "query", required: false, variadic: true }],
  run: async ({ args }) => runFilesMap(args.length > 0 ? args.join(" ") : undefined),
}];
