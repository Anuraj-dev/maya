import { expect, test, describe } from "bun:test";
import { classify } from "./floor.ts";

describe("irreversible floor", () => {
  test("file_delete always confirms", () => {
    expect(classify({ name: "file_delete", input: { path: "/tmp/x" } }).requiresConfirmation).toBe(true);
  });

  test("file_write to a new file does NOT confirm", () => {
    expect(classify({ name: "file_write", input: { path: "/tmp/new.txt" } }).requiresConfirmation).toBe(false);
  });

  test("file_write that overwrites DOES confirm", () => {
    const v = classify({ name: "file_write", input: { path: "/tmp/x", overwrite: true } });
    expect(v.requiresConfirmation).toBe(true);
    expect(v.category).toBe("file_overwrite");
  });

  test("plain shell command does not confirm", () => {
    expect(classify({ name: "shell_run", input: { command: "ls -la" } }).requiresConfirmation).toBe(false);
  });

  test("sudo / install / rm -rf shell commands confirm", () => {
    for (const command of ["sudo reboot", "dnf install vim", "pip install requests", "rm -rf build", "bun add foo"]) {
      expect(classify({ name: "shell_run", input: { command } }).requiresConfirmation).toBe(true);
    }
  });

  test("browser click on a 'Pay' button is a payment", () => {
    const v = classify({ name: "browser_click", input: { text: "Pay now" } });
    expect(v.requiresConfirmation).toBe(true);
    expect(v.category).toBe("payment");
  });

  test("browser click on 'Send' / 'Publish' is send_or_publish", () => {
    expect(classify({ name: "browser_click", input: { text: "Send email" } }).category).toBe("send_or_publish");
    expect(classify({ name: "browser_click", input: { text: "Publish post" } }).category).toBe("send_or_publish");
  });

  test("ordinary navigation/read are never gated", () => {
    expect(classify({ name: "browser_navigate", input: { url: "https://x" } }).requiresConfirmation).toBe(false);
    expect(classify({ name: "browser_read", input: {} }).requiresConfirmation).toBe(false);
    expect(classify({ name: "browser_click", input: { text: "Next page" } }).requiresConfirmation).toBe(false);
  });

  test("email/payment dedicated tools always confirm", () => {
    expect(classify({ name: "email_send", input: {} }).requiresConfirmation).toBe(true);
    expect(classify({ name: "payment_charge", input: {} }).requiresConfirmation).toBe(true);
  });
});
