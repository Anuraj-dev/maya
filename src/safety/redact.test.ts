import { expect, test, describe } from "bun:test";
import { redactString, redactSecrets, REDACTED } from "./redact.ts";

describe("audit redaction (W4.4)", () => {
  test("masks bearer tokens but keeps the 'Bearer ' prefix", () => {
    const out = redactString("Authorization: Bearer abc123XYZ.tok_en-99");
    expect(out).toContain("Bearer");
    expect(out).toContain(REDACTED);
    expect(out).not.toContain("abc123XYZ");
  });

  test("masks provider API keys", () => {
    expect(redactString("export OPENAI_API_KEY=sk-abcdefghijklmnop1234")).not.toContain("sk-abcdefghijklmnop1234");
    expect(redactString("AKIAIOSFODNN7EXAMPLE here")).toContain(REDACTED);
    expect(redactString("token ghp_abcdefghijklmnopqrstuvwxyz0123")).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123");
  });

  test("masks key=value secrets but keeps the key name", () => {
    const out = redactString("password=hunter2 and api_key: s3cr3tvalue");
    expect(out).toContain("password=");
    expect(out).toContain("api_key:");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("s3cr3tvalue");
  });

  test("leaves benign text untouched", () => {
    const benign = "list the files in ~/Anuraj-Dev/maya and show the git log";
    expect(redactString(benign)).toBe(benign);
  });

  test("deep-redacts nested tool inputs (shell command, file contents)", () => {
    const input = {
      command: "curl -H 'Authorization: Bearer s3cr3ttoken123' https://api.x",
      meta: { notes: ["password=letmein", "ok"] },
      count: 3,
    };
    const out = redactSecrets(input);
    expect(JSON.stringify(out)).not.toContain("s3cr3ttoken123");
    expect(JSON.stringify(out)).not.toContain("letmein");
    expect(out.count).toBe(3); // non-strings pass through untouched
    expect(out.meta.notes[1]).toBe("ok");
  });
});
