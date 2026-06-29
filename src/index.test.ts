import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EXPECTED_CAPABILITIES } from "./cli/__tests__/capabilities-fixture.ts";
import type { CapabilitiesContract } from "./cli/capabilities.ts";
import { runMayaCli } from "./cli/__tests__/process.ts";
import { createDocsIndexFixture, VALID_INDEX_ENTRIES } from "./docs-index/__tests__/fixture.ts";

function createDoctorHome(options: {
  config?: string;
  claudeSkill?: boolean;
  codexSkill?: boolean;
} = {}): string {
  const home = mkdtempSync(join(tmpdir(), "maya-doctor-test-"));
  mkdirSync(join(home, ".config", "maya"), { recursive: true });

  if (options.config !== undefined) {
    writeFileSync(join(home, ".config", "maya", "config.json"), options.config);
  }

  if (options.claudeSkill) {
    mkdirSync(join(home, ".claude", "skills", "maya"), { recursive: true });
    writeFileSync(join(home, ".claude", "skills", "maya", "SKILL.md"), "# maya\n");
  }

  if (options.codexSkill) {
    mkdirSync(join(home, ".codex", "skills", "maya"), { recursive: true });
    writeFileSync(join(home, ".codex", "skills", "maya", "SKILL.md"), "# maya\n");
  }

  return home;
}

function createFindFixture() {
  const docsFixture = createDocsIndexFixture({
    files: [
      {
        name: "alpha-helper",
        category: "entrypoint",
        description: "Prefix match fixture.",
        filePath: "src/alpha-helper.ts",
        relatedDocsPath: "docs/alpha-guide.md",
        relatedMcpTool: null,
        futureCliCommand: null,
        keywords: ["alpha"],
        whenToUse: "Use for alpha-prefixed file matches.",
      },
      {
        name: "zeta-browser-notes",
        category: "documentation",
        description: "Keyword-only fixture for browser discovery.",
        filePath: "src/zeta-browser-notes.ts",
        relatedDocsPath: "docs/browser-notes.md",
        relatedMcpTool: null,
        futureCliCommand: null,
        keywords: ["browser", "notes"],
        whenToUse: "Use when browser notes are enough.",
      },
    ],
    tools: [
      {
        name: "alpha",
        category: "browser",
        description: "Exact match fixture.",
        filePath: "src/tools/alpha.ts",
        relatedDocsPath: "docs/alpha-guide.md",
        mcpTool: "alpha",
        futureCliCommand: null,
        keywords: ["alpha", "browser"],
        whenToUse: "Use for exact alpha tool matches.",
      },
      {
        name: "beta-browser",
        category: "browser",
        description: "Browser keyword fixture.",
        filePath: "src/tools/beta-browser.ts",
        relatedDocsPath: "docs/browser-notes.md",
        mcpTool: "beta-browser",
        futureCliCommand: null,
        keywords: ["browser"],
        whenToUse: "Use for browser keyword matches.",
      },
    ],
    commands: [
      {
        name: "maya omega",
        category: "discovery",
        status: "planned",
        description: "Alpha description fixture.",
        filePath: null,
        relatedDocsPath: "docs/omega.md",
        keywords: ["omega"],
        whenToUse: "Use for description-only alpha matches.",
      },
      {
        name: "maya zulu",
        category: "discovery",
        status: "planned",
        description: "Browser command fixture.",
        filePath: null,
        relatedDocsPath: "docs/browser-notes.md",
        keywords: ["browser"],
        whenToUse: "Use for browser command matches.",
      },
    ],
  });

  mkdirSync(join(docsFixture.root, "src"), { recursive: true });
  mkdirSync(join(docsFixture.root, "src", "tools"), { recursive: true });
  mkdirSync(join(docsFixture.root, "docs"), { recursive: true });
  writeFileSync(join(docsFixture.root, "src", "alpha-helper.ts"), "");
  writeFileSync(join(docsFixture.root, "src", "zeta-browser-notes.ts"), "");
  writeFileSync(join(docsFixture.root, "src", "tools", "alpha.ts"), "");
  writeFileSync(join(docsFixture.root, "src", "tools", "beta-browser.ts"), "");
  writeFileSync(join(docsFixture.root, "docs", "alpha-guide.md"), "# Alpha guide\n");
  writeFileSync(join(docsFixture.root, "docs", "browser-notes.md"), "# Browser notes\n");
  writeFileSync(join(docsFixture.root, "docs", "omega.md"), "# Omega\n");

  return docsFixture;
}

describe("S1 — CLI process boundary", () => {
  test("maya --help exits 0 with grouped concise text", async () => {
    const result = await runMayaCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("maya <command>");
    expect(result.stdout).toContain("Runtime:");
    expect(result.stdout).toContain("maya serve");
    expect(result.stdout).toContain("maya proc <command>");
    expect(result.stdout).toContain("maya terminal <command>");
    expect(result.stdout).not.toContain("maya proc start");
    expect(result.stdout).toContain("Discovery:");
    expect(result.stderr).toBe("");
  });

  test("maya terminal --help lists only terminal commands", async () => {
    const result = await runMayaCli(["terminal", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("maya terminal <command>");
    expect(result.stdout).toContain("maya terminal run");
    expect(result.stdout).not.toContain("maya proc start");
    expect(result.stderr).toBe("");
  });

  test("maya serve --help exposes the demoted optional MCP launcher", async () => {
    const result = await runMayaCli(["serve", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("maya serve");
    expect(result.stdout).toContain("optional MCP stdio server");
    expect(result.stdout).toContain("shared runTool wrapper");
    expect(result.stderr).toBe("");
  });

  test("maya mcp --help preserves the compatibility alias", async () => {
    const result = await runMayaCli(["mcp", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("maya mcp");
    expect(result.stdout).toContain("compatibility alias for `maya serve`");
    expect(result.stderr).toBe("");
  });

  test("help does not load runtime-heavy command dependencies", async () => {
    const result = await runMayaCli(
      ["terminal", "--help"],
      { entry: join(import.meta.dir, "cli/__tests__/lazy-help-fixture.ts") },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("maya terminal run");
    expect(result.stderr).toBe("");
  });

  test("maya --version preserves the existing version surface", async () => {
    const result = await runMayaCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("0.0.0\n");
    expect(result.stderr).toBe("");
  });

  test("maya status preserves the existing daemon-status output", async () => {
    const result = await runMayaCli(["status"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("maya: not running.\n");
    expect(result.stderr).toBe("");
  });

  test("maya ask forwards the unchanged prompt and provider to runOnce", async () => {
    const result = await runMayaCli(
      ["ask", "open", "github.com", "--provider", "gemini"],
      { entry: join(import.meta.dir, "cli/__tests__/ask-fixture.ts") },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('{"command":"open github.com","options":{"provider":"gemini"}}\n');
    expect(result.stderr).toBe("");
  });

  test("maya doctor fails when a required agent skill is missing", async () => {
    const home = createDoctorHome({
      config: JSON.stringify({
        anthropicApiKey: "top-secret-anthropic",
        geminiApiKey: "top-secret-gemini",
      }),
      claudeSkill: true,
      codexSkill: false,
    });

    try {
      const result = await runMayaCli(["doctor", "--json"], {
        home,
        env: { PATH: "" },
      });
      const payload = result.parseEnvelope<{
        ok: boolean;
        version: string;
        command: string;
        data: {
          ok: boolean;
          summary: { requiredFailed: number; optionalFailed: number };
          checks: Array<{
            id: string;
            ok: boolean;
            severity: string;
            details?: Record<string, unknown>;
            nextStep?: string;
          }>;
        };
      }>();

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(payload.ok).toBe(true);
      expect(payload.command).toBe("doctor");
      expect(payload.data.ok).toBe(false);
      expect(payload.data.summary.requiredFailed).toBeGreaterThan(0);
      expect(payload.data.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "skill-claude",
            ok: true,
            severity: "required",
          }),
          expect.objectContaining({
            id: "skill-codex",
            ok: false,
            severity: "required",
            nextStep: expect.stringContaining("maya setup codex"),
          }),
        ]),
      );
      expect(JSON.stringify(payload)).not.toContain("top-secret-anthropic");
      expect(JSON.stringify(payload)).not.toContain("top-secret-gemini");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("maya doctor keeps optional dependency failures non-fatal when required checks pass", async () => {
    const home = createDoctorHome({
      config: JSON.stringify({
        anthropicApiKey: "top-secret-anthropic",
      }),
      claudeSkill: true,
      codexSkill: true,
    });

    try {
      const result = await runMayaCli(["doctor", "--json"], {
        home,
        env: { PATH: "" },
      });
      const payload = result.parseEnvelope<{
        data: {
          ok: boolean;
          summary: { requiredFailed: number; optionalFailed: number };
          checks: Array<{ id: string; ok: boolean; severity: string }>;
        };
      }>();

      expect(result.exitCode).toBe(0);
      expect(payload.data.ok).toBe(true);
      expect(payload.data.summary.requiredFailed).toBe(0);
      expect(payload.data.summary.optionalFailed).toBeGreaterThan(0);
      expect(payload.data.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "playwright",
            severity: "optional",
          }),
          expect.objectContaining({
            id: "paplay",
            ok: false,
            severity: "optional",
          }),
        ]),
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("maya doctor fails when the docs-index catalogs do not validate", async () => {
    const home = createDoctorHome({
      claudeSkill: true,
      codexSkill: true,
    });
    const docsFixture = createDocsIndexFixture({
      commands: [{
        ...VALID_INDEX_ENTRIES.commands[0]!,
        relatedDocsPath: "missing.md",
      }],
    });

    try {
      const result = await runMayaCli(["doctor", "--json"], {
        home,
        env: {
          PATH: "",
          MAYA_DOCTOR_DOCS_ROOT: docsFixture.root,
        },
      });
      const payload = result.parseEnvelope<{
        data: {
          ok: boolean;
          summary: { requiredFailed: number };
          checks: Array<{
            id: string;
            ok: boolean;
            severity: string;
            details?: { error?: string };
          }>;
        };
      }>();
      const docsCheck = payload.data.checks.find((check) => check.id === "docs-index");

      expect(result.exitCode).toBe(1);
      expect(payload.data.ok).toBe(false);
      expect(payload.data.summary.requiredFailed).toBeGreaterThan(0);
      expect(docsCheck).toEqual(expect.objectContaining({
        id: "docs-index",
        ok: false,
        severity: "required",
      }));
      expect(docsCheck?.details?.error).toContain("references missing path: missing.md");
    } finally {
      rmSync(home, { recursive: true, force: true });
      docsFixture.cleanup();
    }
  });

  test("maya doctor text and json output stay deterministic for the same home", async () => {
    const home = createDoctorHome({
      config: JSON.stringify({
        anthropicApiKey: "top-secret-anthropic",
        brain: { provider: "gemini" },
      }),
      claudeSkill: true,
      codexSkill: true,
    });

    try {
      const firstJson = await runMayaCli(["doctor", "--json"], {
        home,
        env: { PATH: "" },
      });
      const secondJson = await runMayaCli(["doctor", "--json"], {
        home,
        env: { PATH: "" },
      });
      const text = await runMayaCli(["doctor"], {
        home,
        env: { PATH: "" },
      });
      const payload = firstJson.parseEnvelope<{
        data: {
          checks: Array<{
            id: string;
            details?: {
              anthropicApiKey?: string | null;
              geminiApiKey?: string | null;
              brainProvider?: string;
            };
          }>;
        };
      }>();
      const configCheck = payload.data.checks.find((check) => check.id === "config");

      expect(firstJson.exitCode).toBe(0);
      expect(secondJson.exitCode).toBe(0);
      expect(text.exitCode).toBe(0);
      expect(secondJson.stdout).toBe(firstJson.stdout);
      expect(text.stdout).toContain("Maya doctor: OK");
      expect(text.stdout).toContain("Required (");
      expect(text.stdout).toContain("Optional (");
      expect(text.stdout).not.toContain("top-secret-anthropic");
      expect(configCheck?.details?.anthropicApiKey).toBe("[redacted]");
      expect(configCheck?.details?.geminiApiKey).toBeNull();
      expect(configCheck?.details?.brainProvider).toBe("gemini");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("maya doctor marks Playwright unhealthy when the module exists but Chromium is missing", async () => {
    const home = createDoctorHome({
      claudeSkill: true,
      codexSkill: true,
    });

    try {
      const result = await runMayaCli(["doctor", "--json"], {
        home,
        env: {
          PATH: "",
          MAYA_DOCTOR_PLAYWRIGHT_EXECUTABLE: join(home, "missing-chromium"),
        },
      });
      const payload = result.parseEnvelope<{
        data: {
          ok: boolean;
          checks: Array<{
            id: string;
            ok: boolean;
            severity: string;
            summary?: string;
            details?: { executablePath?: string | null };
          }>;
        };
      }>();
      const playwrightCheck = payload.data.checks.find((check) => check.id === "playwright");

      expect(result.exitCode).toBe(0);
      expect(payload.data.ok).toBe(true);
      expect(playwrightCheck).toEqual(expect.objectContaining({
        id: "playwright",
        ok: false,
        severity: "optional",
        summary: "Playwright module is available, but the Chromium executable is missing.",
      }));
      expect(playwrightCheck?.details?.executablePath).toBe(join(home, "missing-chromium"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("unknown command exits non-zero with invalid_command and a suggestion", async () => {
    const result = await runMayaCli(["stats"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("error [invalid_command]");
    expect(result.stderr).toContain('Did you mean "status"?');
  });

  test("--json wraps results in the versioned envelope", async () => {
    const result = await runMayaCli(["capabilities", "--json"]);
    const payload = result.parseEnvelope<{
      ok: boolean;
      version: string;
      command: string;
      data: { commands: unknown[] };
    }>();

    expect(result.exitCode).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.version).toBe("1");
    expect(payload.command).toBe("capabilities");
    expect(Array.isArray(payload.data.commands)).toBe(true);
  });

  test("a value option missing its value yields invalid_option", async () => {
    const result = await runMayaCli(["ask", "--provider"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("error [invalid_option]");
  });

  test("an undeclared option yields a JSON invalid_option envelope", async () => {
    const result = await runMayaCli(["ask", "do something", "--bogus", "--json"]);
    const payload = result.parseEnvelope();

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(payload).toEqual({
      ok: false,
      version: "1",
      command: "ask",
      error: {
        code: "invalid_option",
        message: 'Unknown option "--bogus".',
        details: { option: "--bogus", reason: "unknown" },
      },
    });
  });

  test("missing command input yields a JSON invalid_usage envelope", async () => {
    const result = await runMayaCli(["ask", "--json"]);
    const payload = result.parseEnvelope();

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(payload).toEqual({
      ok: false,
      version: "1",
      command: "ask",
      error: {
        code: "invalid_usage",
        message: "Missing required argument <command>.",
        details: { argument: "command" },
      },
    });
  });

  test("a command failure yields a JSON execution_failed envelope", async () => {
    const result = await runMayaCli(["setup", "--json", "--", "invalid"]);
    const payload = result.parseEnvelope();

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(payload).toEqual({
      ok: false,
      version: "1",
      command: "setup",
      error: {
        code: "execution_failed",
        message: 'Unknown client "invalid". Use: maya setup [claude|codex]',
        details: { stderr: 'Unknown client "invalid". Use: maya setup [claude|codex]' },
      },
    });
  });
});

describe("S6 — capabilities snapshot", () => {
  test("maya capabilities is a deterministic, versioned registry contract", async () => {
    const first = await runMayaCli(["capabilities", "--json"]);
    const second = await runMayaCli(["capabilities", "--json"]);
    const payload = first.parseEnvelope<{
      ok: boolean;
      version: string;
      command: string;
      data: CapabilitiesContract;
    }>();

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(second.stdout).toBe(first.stdout);
    expect({
      ...payload,
      data: { ...payload.data, tools: [] },
    }).toEqual({
      ok: true,
      version: "1",
      command: "capabilities",
      data: EXPECTED_CAPABILITIES,
    });
  });

  test("S3 — every active tool is listed with a generic call command", async () => {
    const result = await runMayaCli(["capabilities", "--json"]);
    const payload = result.parseEnvelope<{ data: CapabilitiesContract }>();

    expect(payload.data.tools.map((tool) => tool.name)).toEqual([
      "app_open",
      "browser_click",
      "browser_click_selector",
      "browser_eval",
      "browser_navigate",
      "browser_press_key",
      "browser_read",
      "browser_screenshot",
      "browser_scroll",
      "browser_type",
      "browser_type_selector",
      "clipboard_read",
      "clipboard_write",
      "file_delete",
      "file_read",
      "file_write",
      "get_context",
      "memory_forget",
      "memory_save",
      "notify",
      "screenshot",
      "shell_run",
      "vault_append",
      "vault_read",
      "vault_search",
      "vault_write",
    ]);
    expect(payload.data.tools.every((tool) => tool.command === `maya tool call ${tool.name}`)).toBe(true);
  });
});

describe("S7 — docs-index find command", () => {
  test("find ranks exact names before prefixes before keyword or description matches", async () => {
    const fixture = createFindFixture();

    try {
      const result = await runMayaCli(["find", "alpha", "--json"], {
        env: { MAYA_DOCS_INDEX_ROOT: fixture.root },
      });
      const payload = result.parseEnvelope<{
        data: {
          query: string;
          results: Array<{ type: string; name: string; path: string; reason: string }>;
        };
      }>();

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(payload.data.query).toBe("alpha");
      expect(payload.data.results.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
        "tool:alpha",
        "file:alpha-helper",
        "doc:docs/alpha-guide.md",
        "command:maya omega",
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  test("find --type restricts result kinds", async () => {
    const fixture = createFindFixture();

    try {
      const result = await runMayaCli(["find", "browser", "--type", "tool", "--json"], {
        env: { MAYA_DOCS_INDEX_ROOT: fixture.root },
      });
      const payload = result.parseEnvelope<{
        data: {
          type: string | null;
          results: Array<{ type: string; name: string }>;
        };
      }>();

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(payload.data.type).toBe("tool");
      expect(payload.data.results).toEqual([
        { type: "tool", name: "beta-browser" },
        { type: "tool", name: "alpha" },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  test("find --limit bounds results and marks truncation explicitly in text and json", async () => {
    const fixture = createFindFixture();

    try {
      const text = await runMayaCli(["find", "browser", "--limit", "2"], {
        env: { MAYA_DOCS_INDEX_ROOT: fixture.root },
      });
      const json = await runMayaCli(["find", "browser", "--limit", "2", "--json"], {
        env: { MAYA_DOCS_INDEX_ROOT: fixture.root },
      });
      const payload = json.parseEnvelope<{
        data: {
          limit: number;
          total: number;
          truncated: boolean;
          results: Array<{ type: string; name: string }>;
        };
      }>();

      expect(text.exitCode).toBe(0);
      expect(text.stderr).toBe("");
      expect(text.stdout).toBe([
        "tool  beta-browser  src/tools/beta-browser.ts  Use for browser keyword matches.",
        "file  zeta-browser-notes  src/zeta-browser-notes.ts  Use when browser notes are enough.",
        "2 of 5 results for \"browser\"",
        "…[truncated to 2 results]",
        "",
      ].join("\n"));
      expect(payload.data.limit).toBe(2);
      expect(payload.data.total).toBe(5);
      expect(payload.data.truncated).toBe(true);
      expect(payload.data.results).toEqual([
        { type: "tool", name: "beta-browser" },
        { type: "file", name: "zeta-browser-notes" },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  test("find reports empty results cleanly", async () => {
    const fixture = createFindFixture();

    try {
      const result = await runMayaCli(["find", "missing"], {
        env: { MAYA_DOCS_INDEX_ROOT: fixture.root },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe('No results for "missing".\n');
    } finally {
      fixture.cleanup();
    }
  });

  test("find text and json stay deterministic for the same docs-index root", async () => {
    const fixture = createFindFixture();

    try {
      const env = { MAYA_DOCS_INDEX_ROOT: fixture.root };
      const firstText = await runMayaCli(["find", "browser"], { env });
      const secondText = await runMayaCli(["find", "browser"], { env });
      const firstJson = await runMayaCli(["find", "browser", "--json"], { env });
      const secondJson = await runMayaCli(["find", "browser", "--json"], { env });

      expect(firstText.exitCode).toBe(0);
      expect(secondText.exitCode).toBe(0);
      expect(firstJson.exitCode).toBe(0);
      expect(secondJson.exitCode).toBe(0);
      expect(secondText.stdout).toBe(firstText.stdout);
      expect(secondJson.stdout).toBe(firstJson.stdout);
    } finally {
      fixture.cleanup();
    }
  });
});
