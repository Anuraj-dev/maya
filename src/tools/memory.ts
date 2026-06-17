/**
 * Memory tools — let Maya persist facts across conversations.
 *
 * memory_save   — add a new fact or update an existing one (by ID)
 * memory_forget — remove a fact by ID
 *
 * The stored notes are injected into the system prompt at daemon startup so Maya begins
 * every session with her remembered context.
 */
import { addMemoryNote, updateMemoryNote, deleteMemoryNote } from "../memory/store.ts";
import type { MayaTool } from "./index.ts";

export const memoryTools: Record<string, MayaTool> = {
  memory_save: {
    spec: {
      name: "memory_save",
      description:
        "Save a fact to your persistent memory so you'll remember it in future conversations. " +
        "Use this when Raja tells you something you should carry forward: a preference, a name, a path, " +
        "a project detail. To update an existing memory, pass its id. To create a new one, omit id. " +
        "Keep each note short — one sentence or one key-value pair.",
      inputSchema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The fact to remember (concise — one sentence or key-value).",
          },
          id: {
            type: "string",
            description:
              "If updating an existing memory, its ID from the memory block in your context. Omit to add a new note.",
          },
        },
        required: ["content"],
      },
    },
    execute: async (input) => {
      const content = String(input.content ?? "").trim();
      if (!content) return "No content provided.";
      const id = typeof input.id === "string" ? input.id.trim() : undefined;

      if (id) {
        const updated = await updateMemoryNote(id, content);
        return updated
          ? `Memory [${id}] updated.`
          : `No memory found with id "${id}". Created a new note instead: ${(await addMemoryNote(content)).id}`;
      }
      const note = await addMemoryNote(content);
      return `Saved as memory [${note.id}].`;
    },
  },

  memory_forget: {
    spec: {
      name: "memory_forget",
      description:
        "Remove a fact from your persistent memory by its ID. " +
        "Use this when a remembered detail is outdated or no longer relevant.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The ID of the memory note to remove (visible in the memory block).",
          },
        },
        required: ["id"],
      },
    },
    execute: async (input) => {
      const id = String(input.id ?? "").trim();
      if (!id) return "No id provided.";
      const deleted = await deleteMemoryNote(id);
      return deleted ? `Memory [${id}] removed.` : `No memory found with id "${id}".`;
    },
  },
};
