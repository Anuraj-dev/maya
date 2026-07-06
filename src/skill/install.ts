import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { generateSkillMarkdown } from "./generate.ts";

export type SkillClient = "claude" | "codex";
export type SkillInstallStatus = "created" | "updated" | "unchanged";

export function installSkill(
  client: SkillClient,
  rootDir?: string,
): { path: string; status: SkillInstallStatus } {
  const path = join(homedir(), client === "claude" ? ".claude" : ".codex", "skills", "maya", "SKILL.md");
  const content = generateSkillMarkdown(rootDir);

  mkdirSync(dirname(path), { recursive: true });

  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    if (current === content) return { path, status: "unchanged" };
    writeFileSync(path, content);
    return { path, status: "updated" };
  }

  writeFileSync(path, content);
  return { path, status: "created" };
}
