/**
 * Obsidian vault tools via the `ob` CLI (~/.local/bin/ob).
 *
 * vault_read   — ob read <title>
 * vault_search — ob search <query>
 * vault_append — ob append [--create] <title> <content>   (safe: appends only)
 * vault_write  — ob write <title> <content>               (overwrites — sends_or_publish floor)
 *
 * ob is Raja's existing vault CLI; we call it as a subprocess and surface its output.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { MayaTool } from "./index.ts";

const OB_BIN = join(homedir(), ".local", "bin", "ob");
const OB_TIMEOUT_MS = 10_000;
const OUT_MAX_CHARS = 8_000;

function trim(s: string): string {
  return s.length > OUT_MAX_CHARS ? `${s.slice(0, OUT_MAX_CHARS)}\n…[truncated]` : s;
}

async function ob(...args: string[]): Promise<{ out: string; ok: boolean }> {
  if (!existsSync(OB_BIN)) {
    return { out: `ob CLI not found at ${OB_BIN}. Install it to use vault tools.`, ok: false };
  }
  const proc = Bun.spawn([OB_BIN, ...args], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill("SIGTERM"), OB_TIMEOUT_MS);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  const out = trim((code === 0 ? stdout : stderr || stdout).trim());
  return { out, ok: code === 0 };
}

export const vaultTools: Record<string, MayaTool> = {
  vault_read: {
    spec: {
      name: "vault_read",
      description:
        "Read a note from Raja's Obsidian vault by its title. Returns the full Markdown content. " +
        "If you're not sure of the exact title, use vault_search first.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The note title (not the file path — just the name, e.g. 'MAD2 Trekking Plan').",
          },
        },
        required: ["title"],
      },
    },
    execute: async (input) => {
      const title = String(input.title ?? "").trim();
      if (!title) return "No title provided.";
      const { out } = await ob("read", title);
      return out;
    },
  },

  vault_search: {
    spec: {
      name: "vault_search",
      description:
        "Full-text search across Raja's Obsidian vault. Returns matching note titles and snippets. " +
        "Use this to find a note when you don't know its exact title, or to look up information " +
        "spread across multiple notes.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search terms to look for in the vault.",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input) => {
      const query = String(input.query ?? "").trim();
      if (!query) return "No query provided.";
      const { out, ok } = await ob("search", query);
      return ok ? (out || "No results found.") : out;
    },
  },

  vault_append: {
    spec: {
      name: "vault_append",
      description:
        "Append text to a note in Raja's Obsidian vault. If the note doesn't exist, it is created. " +
        "Use this to add to existing notes (journal entries, task lists, ongoing logs). " +
        "This is safe — it never overwrites existing content.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Note title to append to (created if it doesn't exist).",
          },
          content: {
            type: "string",
            description: "Markdown text to append to the note.",
          },
        },
        required: ["title", "content"],
      },
    },
    execute: async (input) => {
      const title = String(input.title ?? "").trim();
      const content = String(input.content ?? "").trim();
      if (!title) return "No title provided.";
      if (!content) return "No content to append.";
      const { out, ok } = await ob("append", "--create", title, content);
      return ok ? `Appended to "${title}".` : `Failed to append: ${out}`;
    },
  },

  vault_write: {
    spec: {
      name: "vault_write",
      description:
        "Overwrite the full content of a note in Raja's Obsidian vault. " +
        "This replaces everything in the note and is treated as irreversible (requires confirmation). " +
        "Prefer vault_append for adding content without losing existing text.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Note title to overwrite.",
          },
          content: {
            type: "string",
            description: "New Markdown content for the note (replaces existing content).",
          },
        },
        required: ["title", "content"],
      },
    },
    execute: async (input) => {
      const title = String(input.title ?? "").trim();
      const content = String(input.content ?? "").trim();
      if (!title) return "No title provided.";
      if (!content) return "No content provided.";
      const { out, ok } = await ob("write", title, content);
      return ok ? `Wrote "${title}".` : `Failed to write: ${out}`;
    },
  },
};
