import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { EXPECTED_CAPABILITIES } from "./cli/__tests__/capabilities-fixture.ts";
import { runMayaCli } from "./cli/__tests__/process.ts";

describe("S1 — CLI process boundary", () => {
  test("maya --help exits 0 with grouped concise text", async () => {
    const result = await runMayaCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("maya <command>");
    expect(result.stdout).toContain("Runtime:");
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
    const payload = first.parseEnvelope();

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(second.stdout).toBe(first.stdout);
    expect(payload).toEqual({
      ok: true,
      version: "1",
      command: "capabilities",
      data: EXPECTED_CAPABILITIES,
    });
  });
});
