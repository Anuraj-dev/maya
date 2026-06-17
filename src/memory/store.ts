/**
 * Persistent cross-day memory store.
 *
 * A simple JSON file at ~/.config/maya/memory.json holding a list of short facts Maya
 * should remember across conversations ("Raja prefers dark mode", "the GitHub token lives
 * in ~/.config/tokens/github"). The agent uses memory_save / memory_forget to manage these;
 * the daemon injects all current facts into the system prompt at startup so Maya starts
 * each session already knowing what she's been told.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MAYA_DIR } from "../config/index.ts";

const MEMORY_PATH = join(MAYA_DIR, "memory.json");

export interface MemoryNote {
  id: string;
  content: string;
  savedAt: string;
}

function nextId(notes: MemoryNote[]): string {
  const used = new Set(notes.map((n) => n.id));
  let i = 1;
  while (used.has(String(i))) i++;
  return String(i);
}

export async function loadMemory(): Promise<MemoryNote[]> {
  if (!existsSync(MEMORY_PATH)) return [];
  try {
    return JSON.parse(await Bun.file(MEMORY_PATH).text()) as MemoryNote[];
  } catch {
    return [];
  }
}

async function saveMemory(notes: MemoryNote[]): Promise<void> {
  mkdirSync(MAYA_DIR, { recursive: true });
  await Bun.write(MEMORY_PATH, JSON.stringify(notes, null, 2));
}

export async function addMemoryNote(content: string): Promise<MemoryNote> {
  const notes = await loadMemory();
  const note: MemoryNote = { id: nextId(notes), content, savedAt: new Date().toISOString() };
  await saveMemory([...notes, note]);
  return note;
}

export async function updateMemoryNote(id: string, content: string): Promise<boolean> {
  const notes = await loadMemory();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) return false;
  notes[idx] = { ...notes[idx]!, content, savedAt: new Date().toISOString() };
  await saveMemory(notes);
  return true;
}

export async function deleteMemoryNote(id: string): Promise<boolean> {
  const notes = await loadMemory();
  const filtered = notes.filter((n) => n.id !== id);
  if (filtered.length === notes.length) return false;
  await saveMemory(filtered);
  return true;
}

/** Format current memory as a block to inject into the system prompt. */
export function formatMemoryBlock(notes: MemoryNote[]): string {
  if (notes.length === 0) return "";
  const lines = notes.map((n) => `  [${n.id}] ${n.content}`).join("\n");
  return `\nThings you remember from past conversations (your persistent memory):\n${lines}\n`;
}
