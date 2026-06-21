/**
 * Secret redaction for the audit log (production decision W4.4).
 *
 * audit.ts logs every tool call's full input verbatim — which means shell commands with tokens,
 * file_write contents, and vault writes would persist secrets in PLAINTEXT forever. Since the
 * audit log is the safety net we're trusting, it must not also be a credential dump.
 *
 * `redactSecrets` deep-walks a tool input and scrubs obvious secret material before it is written.
 * Pure — no I/O — so the rules are unit-testable (see redact.test.ts). Conservative by design:
 * it errs toward leaving benign text intact and only masks high-confidence secret shapes.
 */

export const REDACTED = "[REDACTED]";

/** [pattern, group-to-mask] — group 1 is masked; any leading group 2..n is a prefix to keep. */
const RULES: ReadonlyArray<{ re: RegExp; keepPrefix: boolean }> = [
  { re: /\b(sk-[A-Za-z0-9]{16,})\b/g, keepPrefix: false }, // OpenAI-style
  { re: /\b(AKIA[0-9A-Z]{16})\b/g, keepPrefix: false }, // AWS access key id
  { re: /\b(ghp_[A-Za-z0-9]{20,})\b/g, keepPrefix: false }, // GitHub PAT
  { re: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, keepPrefix: false }, // Slack
  { re: /\b(dg_[A-Za-z0-9]{20,})\b/g, keepPrefix: false }, // Deepgram-style
  { re: /(Bearer\s+)([A-Za-z0-9._\-]{8,})/gi, keepPrefix: true }, // Authorization headers
  {
    // key=value / key: value where the key name implies a secret
    re: /((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|auth[_-]?token)\s*[=:]\s*)(["']?)([^\s"']+)\2/gi,
    keepPrefix: true,
  },
];

/** Redact secrets from a single string. */
export function redactString(value: string): string {
  let out = value;
  for (const { re, keepPrefix } of RULES) {
    out = out.replace(re, (...args) => {
      // args: match, g1, [g2…], offset, string
      if (!keepPrefix) return REDACTED;
      const prefix = args[1] as string;
      return `${prefix}${REDACTED}`;
    });
  }
  return out;
}

/** Deep-walk any value (string | array | object) and redact secrets in every string it contains. */
export function redactSecrets<T>(input: T): T {
  if (typeof input === "string") return redactString(input) as unknown as T;
  if (Array.isArray(input)) return input.map((v) => redactSecrets(v)) as unknown as T;
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) out[k] = redactSecrets(v);
    return out as T;
  }
  return input;
}
