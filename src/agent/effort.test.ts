import { expect, test, describe } from "bun:test";
import { chooseBrain } from "./effort.ts";
import { ConfigSchema } from "../config/index.ts";

const config = ConfigSchema.parse({});

describe("auto-effort controller", () => {
  test("routine steps use Haiku with no effort params", () => {
    const b = chooseBrain("routine", config);
    expect(b.model).toContain("haiku");
    expect(b.effort).toBeNull();
    expect(b.thinking).toBeNull();
    expect(b.escalateAsSubAgent).toBe(false);
  });

  test("planning uses Haiku with no effort params", () => {
    const b = chooseBrain("planning", config);
    expect(b.model).toContain("haiku");
    expect(b.effort).toBeNull();
  });

  test("trivial uses Haiku with no effort params", () => {
    const b = chooseBrain("trivial", config);
    expect(b.model).toContain("haiku");
    expect(b.effort).toBeNull();
  });

  test("coding escalates to Sonnet at low effort", () => {
    const b = chooseBrain("coding", config);
    expect(b.model).toContain("sonnet");
    expect(b.effort).toBe("low");
    expect(b.escalateAsSubAgent).toBe(false);
  });

  test("coding model can be overridden via config escalationModel", () => {
    const custom = ConfigSchema.parse({ brain: { escalationModel: "claude-sonnet-custom" } });
    expect(chooseBrain("coding", custom).model).toBe("claude-sonnet-custom");
  });
});
