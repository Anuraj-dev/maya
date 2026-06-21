/**
 * Catastrophic-command gate (production decision W4.1: "tiered — gate only the catastrophic").
 *
 * The old floor.ts confirmed EVERY sudo/install/rm. The production decision is to stop gating
 * recoverable things (they slow Raja down) and instead hard-gate only the handful of commands
 * that are genuinely unrecoverable — wiping home/root, writing a raw disk, formatting a
 * filesystem, a fork bomb, or piping the network straight into a shell.
 *
 * This is the function the MCP server consults BEFORE running shell_run: a `catastrophic` verdict
 * means "do not run without confirm:true", exactly like a payment. Everything else runs (audited).
 *
 * Pure — no I/O — so it is trivially unit-testable (see catastrophic.test.ts).
 */

export type Catastrophe =
  | "wipe-home-or-root"
  | "disk-write"
  | "format-fs"
  | "fork-bomb"
  | "curl-pipe-sh";

export interface CatastropheVerdict {
  catastrophic: boolean;
  pattern?: Catastrophe;
  reason?: string;
}

const NOT: CatastropheVerdict = { catastrophic: false };

/** `rm` invoked with BOTH a recursive and a force flag (covers -rf, -fr, -r -f, --recursive --force). */
const RM_RECURSIVE_FORCE =
  /\brm\b(?=[^|;&\n]*(?:-\w*r|--recursive))(?=[^|;&\n]*(?:-\w*f|--force))/i;

/** A delete target rooted at filesystem root or the user's home — the unrecoverable ones. */
const ROOT_OR_HOME_TARGET = /(?:^|\s)(?:\/|~|\$HOME|\$\{HOME\})(?:\s|\/\*?|\*|$)/;

const CURL_PIPE_SH = /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash)\b/i;
const FORK_BOMB = /\(\s*\)\s*\{\s*:?\s*\|\s*:?\s*&\s*\}\s*;\s*:/;
const MKFS = /\bmkfs(?:\.\w+)?\b/i;
const DD_TO_DEVICE = /\bdd\b[^\n]*\bof=\/dev\/\w+/i;
const REDIRECT_TO_DEVICE = />\s*\/dev\/(?:sd|nvme|vd|hd|mmcblk)\w*/i;

/**
 * Classify a shell command. Returns `{ catastrophic: true, … }` only for the unrecoverable set.
 * Recoverable-but-spicy commands (ordinary `rm -rf build`, `sudo systemctl restart`, package
 * installs) are intentionally NOT gated here — the audit log covers them.
 */
export function classifyCatastrophic(command: string): CatastropheVerdict {
  const cmd = String(command ?? "");
  if (!cmd.trim()) return NOT;

  if (CURL_PIPE_SH.test(cmd)) {
    return { catastrophic: true, pattern: "curl-pipe-sh", reason: "pipes a network download straight into a shell" };
  }
  if (FORK_BOMB.test(cmd)) {
    return { catastrophic: true, pattern: "fork-bomb", reason: "fork bomb — will exhaust the process table" };
  }
  if (MKFS.test(cmd)) {
    return { catastrophic: true, pattern: "format-fs", reason: "formats a filesystem" };
  }
  if (DD_TO_DEVICE.test(cmd) || REDIRECT_TO_DEVICE.test(cmd)) {
    return { catastrophic: true, pattern: "disk-write", reason: "writes raw bytes to a block device" };
  }
  if (RM_RECURSIVE_FORCE.test(cmd) && ROOT_OR_HOME_TARGET.test(cmd)) {
    return { catastrophic: true, pattern: "wipe-home-or-root", reason: "recursive force-delete rooted at home or /" };
  }
  return NOT;
}
