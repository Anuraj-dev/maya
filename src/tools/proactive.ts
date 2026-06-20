/**
 * Proactivity tools — let Maya surface things to Raja without being spoken to first.
 *
 *   notify           — fire a desktop notification now (notify-send)
 *   remind           — schedule a notification / spoken reminder for later
 *   reminders_list   — list pending reminders
 *   reminder_cancel  — cancel a pending reminder by id
 *
 * `notify` needs no state, so it is always available. The reminder tools need the shared
 * ReminderService (started by the MCP server with a `fire` wired to notify/speak); when no
 * service is injected (headless/daemon paths) they are simply omitted — mirroring how
 * voice_ask is only present when an asker is wired.
 */
import type { MayaTool } from "./index.ts";
import {
  buildNotifyArgs,
  describeReminder,
  type NotifyInput,
  type ReminderInput,
  type ReminderService,
} from "../proactive/reminders.ts";

export interface ProactiveDeps {
  reminders?: ReminderService;
}

/** Spawn notify-send with the given argv. Returns a human summary or a clear failure. */
export async function sendNotification(input: NotifyInput): Promise<string> {
  const bin = await Bun.which("notify-send");
  if (!bin) {
    return "Notifications unavailable: notify-send is not installed (sudo dnf install libnotify).";
  }
  const args = buildNotifyArgs(input);
  const proc = Bun.spawn([bin, ...args], { stdout: "ignore", stderr: "pipe" });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    return `notify failed: ${err.trim() || `exit ${proc.exitCode}`}`;
  }
  return `Notified: "${input.title ?? "Maya"}" — ${input.body}`;
}

export function proactiveTools(deps: ProactiveDeps = {}): Record<string, MayaTool> {
  const tools: Record<string, MayaTool> = {
    notify: {
      spec: {
        name: "notify",
        description:
          "Show a desktop notification to Raja right now (a toast in the corner of his screen). " +
          "Use this to surface something he should see without interrupting him by voice — a result, " +
          "a heads-up, a status. For something he should be told LATER, use `remind` instead.",
        inputSchema: {
          type: "object",
          properties: {
            body: { type: "string", description: "The notification text (the main message)." },
            title: { type: "string", description: "Optional title/heading. Defaults to 'Maya'." },
            urgency: {
              type: "string",
              enum: ["low", "normal", "critical"],
              description: "How prominent: 'low', 'normal' (default), or 'critical' (stays until dismissed).",
            },
            icon: { type: "string", description: "Optional icon name, e.g. 'dialog-information'." },
          },
          required: ["body"],
        },
      },
      execute: async (input) => {
        try {
          return await sendNotification(input as unknown as NotifyInput);
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      },
    },
  };

  const reminders = deps.reminders;
  if (reminders) {
    tools.remind = {
      spec: {
        name: "remind",
        description:
          "Schedule a reminder for later — Maya will pop a notification (or speak) at the chosen time, " +
          "even if Raja never asks again. Convert his words into time yourself: pass delaySeconds for " +
          "relative ('in 5 minutes' → 300) or an ISO timestamp in `at` for absolute ('at 3pm today'). " +
          "Reminders survive restarts.",
        inputSchema: {
          type: "object",
          properties: {
            body: { type: "string", description: "What to remind him about." },
            delaySeconds: { type: "number", description: "Fire this many seconds from now (relative time)." },
            at: { type: "string", description: "ISO-8601 timestamp to fire at (absolute time). Use this OR delaySeconds." },
            kind: {
              type: "string",
              enum: ["notify", "speak"],
              description: "'notify' (default) shows a toast; 'speak' says it aloud in Maya's voice.",
            },
            title: { type: "string", description: "Optional notification title. Defaults to 'Reminder'." },
            urgency: { type: "string", enum: ["low", "normal", "critical"], description: "Notification urgency." },
          },
          required: ["body"],
        },
      },
      execute: async (input) => {
        try {
          const r = reminders.add(input as unknown as ReminderInput);
          return `Reminder set — ${describeReminder(r, Date.now())}. Cancel with reminder_cancel id "${r.id}".`;
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      },
    };

    tools.reminders_list = {
      spec: {
        name: "reminders_list",
        description: "List Raja's pending reminders (soonest first), with their ids so you can cancel one.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      execute: async () => {
        const now = Date.now();
        const list = reminders.list();
        if (list.length === 0) return "No pending reminders.";
        return list.map((r) => describeReminder(r, now)).join("\n");
      },
    };

    tools.reminder_cancel = {
      spec: {
        name: "reminder_cancel",
        description: "Cancel a pending reminder by its id (from reminders_list).",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "The reminder id to cancel." } },
          required: ["id"],
        },
      },
      execute: async (input) => {
        const id = String(input.id ?? "").trim();
        if (!id) return "No id provided.";
        return reminders.cancel(id) ? `Cancelled reminder ${id}.` : `No pending reminder with id "${id}".`;
      },
    };
  }

  return tools;
}
