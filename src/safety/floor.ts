import type { IrreversibleCategory } from "../config/index.ts";

/**
 * The irreversible-action floor.
 *
 * Maya self-judges risk in the model, but this guard runs in code BEFORE any tool
 * executes and is the non-bypassable backstop: it classifies a proposed tool call and,
 * if it lands in an irreversible category, the daemon MUST get user confirmation before
 * executing — regardless of what the model decided. Enforced at the dedicated-tool layer
 * (typed tool calls are gateable; a raw bash blob would not be).
 */

export interface ProposedToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface FloorVerdict {
  /** True when this call must be confirmed by the user before running. */
  requiresConfirmation: boolean;
  category?: IrreversibleCategory;
  reason?: string;
}

const SUDO_OR_INSTALL =
  /\b(sudo|doas|pkexec|dnf|rpm|pacman|apt(-get)?|yay|paru|pip install|npm i(nstall)?\b|bun add|cargo install|rm\s+-rf?\b)\b/i;

/** Pure classification — no I/O — so it is trivially unit-testable. */
export function classify(call: ProposedToolCall): FloorVerdict {
  const { name, input } = call;

  switch (name) {
    case "file_delete":
      return { requiresConfirmation: true, category: "file_delete", reason: "deletes a file" };

    case "file_write":
    case "file_overwrite": {
      // Overwriting an existing path is irreversible; creating a new file is not.
      if (input.overwrite === true || input.exists === true) {
        return {
          requiresConfirmation: true,
          category: "file_overwrite",
          reason: "overwrites an existing file",
        };
      }
      return { requiresConfirmation: false };
    }

    case "shell_run": {
      const cmd = String(input.command ?? "");
      if (SUDO_OR_INSTALL.test(cmd)) {
        return {
          requiresConfirmation: true,
          category: "shell_sudo_or_install",
          reason: "elevated, installs packages, or recursively deletes",
        };
      }
      return { requiresConfirmation: false };
    }

    case "browser_submit":
    case "browser_click": {
      // Heuristic: clicks/submits whose target text implies an irreversible action.
      const target = `${input.text ?? ""} ${input.label ?? ""}`.toLowerCase();
      if (/\b(pay|buy|purchase|checkout|place order|confirm payment)\b/.test(target)) {
        return { requiresConfirmation: true, category: "payment", reason: "payment / purchase" };
      }
      if (/\b(send|post|publish|tweet|submit|delete|remove)\b/.test(target)) {
        return {
          requiresConfirmation: true,
          category: "send_or_publish",
          reason: "sends / posts / publishes / deletes",
        };
      }
      return { requiresConfirmation: false };
    }

    case "vault_write":
      return { requiresConfirmation: true, category: "send_or_publish", reason: "overwrites an Obsidian note" };

    case "email_send":
    case "message_send":
      return { requiresConfirmation: true, category: "send_or_publish", reason: "sends a message" };

    case "payment_charge":
      return { requiresConfirmation: true, category: "payment", reason: "charges money" };

    default:
      return { requiresConfirmation: false };
  }
}
