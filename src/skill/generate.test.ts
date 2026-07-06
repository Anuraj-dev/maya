import { describe, expect, test } from "bun:test";
import { generateSkillMarkdown } from "./generate.ts";

describe("generateSkillMarkdown", () => {
  test("emits the Maya skill frontmatter and thin discovery body", () => {
    const markdown = generateSkillMarkdown();

    expect(markdown.startsWith("---\nname: maya\n")).toBe(true);
    expect(markdown).toMatch(/description: ".+"/);
    expect(markdown).toContain("## Browser Tools");
    expect(markdown).toContain("## Shell Tools");
    expect(markdown).toContain("`maya capabilities`");
    expect(markdown).toContain("`maya tool describe <name>`");
    expect(markdown).toContain("`maya find <query>`");
  });
});
