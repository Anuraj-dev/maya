/**
 * File tools: file_read, file_write, file_delete.
 *
 * The irreversible floor (safety/floor.ts) intercepts:
 *  - file_delete: always requires confirmation
 *  - file_write with overwrite:true: requires confirmation when the file already exists
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import type { MayaTool } from "./index.ts";
import { trashFile, snapshotFile } from "../safety/audit.ts";

const READ_MAX_CHARS = 10_000;

function resolvePath(p: string): string {
  return resolve(p.startsWith("~") ? p.replace("~", homedir()) : p);
}

export const fileTools: Record<string, MayaTool> = {
  file_read: {
    spec: {
      name: "file_read",
      description:
        "Read the text content of a file. Returns the content (truncated at 10 000 characters). " +
        "Use absolute paths or ~ for the home directory.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file (~ is expanded)." },
        },
        required: ["path"],
      },
    },
    execute: async (input) => {
      const p = resolvePath(String(input.path ?? ""));
      if (!p) return "No path provided.";
      const file = Bun.file(p);
      if (!(await file.exists())) return `File not found: ${p}`;
      const text = await file.text();
      return text.length > READ_MAX_CHARS
        ? `${text.slice(0, READ_MAX_CHARS)}\n…[truncated at ${READ_MAX_CHARS} chars]`
        : text || "(empty file)";
    },
  },

  file_write: {
    spec: {
      name: "file_write",
      description:
        "Write text content to a file. If the file already exists, set overwrite:true to replace it " +
        "(the previous contents are snapshotted first, so an overwrite is reversible via the undo tool). " +
        "Creates parent directories as needed. Use for creating new files, config snippets, notes, scripts, etc.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file (~ is expanded)." },
          content: { type: "string", description: "Text content to write." },
          overwrite: {
            type: "boolean",
            description:
              "Set true to overwrite an existing file. Omit or set false to fail if the file exists.",
          },
        },
        required: ["path", "content"],
      },
    },
    execute: async (input) => {
      const p = resolvePath(String(input.path ?? ""));
      if (!p) return "No path provided.";
      const content = String(input.content ?? "");
      const overwrite = input.overwrite === true;

      const exists = existsSync(p);
      if (exists && !overwrite) {
        return `File already exists: ${p}. Pass overwrite:true to replace it.`;
      }

      mkdirSync(dirname(p), { recursive: true });
      // Snapshot the old contents before clobbering so the overwrite is reversible via `undo`.
      const snap = exists ? await snapshotFile(p) : null;
      await Bun.write(p, content);
      return exists
        ? `Overwrote ${p} (${content.length} chars). Previous version saved${snap ? "" : " (no snapshot)"} — reversible with the undo tool.`
        : `Created ${p} (${content.length} chars).`;
    },
  },

  file_delete: {
    spec: {
      name: "file_delete",
      description:
        "Delete a file. The file is moved to Maya's trash (not unlinked), so it can be restored " +
        "with the undo tool. Cannot delete directories — use shell_run with 'rm -r' for that.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file to delete (~ is expanded)." },
        },
        required: ["path"],
      },
    },
    execute: async (input) => {
      const p = resolvePath(String(input.path ?? ""));
      if (!p) return "No path provided.";
      if (!existsSync(p)) return `File not found: ${p}`;
      // Move to trash rather than unlink — recoverable via the undo tool.
      const trashed = await trashFile(p);
      return `Moved ${p} to trash (${trashed}). Reversible with the undo tool.`;
    },
  },
};
