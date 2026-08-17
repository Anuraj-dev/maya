import { invalidUsage } from "./errors.ts";
import { parseIndex, resolveScreenshotPath, runBrowserTool } from "./browser-worker.ts";
import type { CommandSpec } from "./types.ts";

const selectorOption = {
  long: "--selector",
  type: "string" as const,
  description: "Target a CSS selector instead of visible text or an accessible field name.",
};
const indexOption = {
  long: "--index",
  type: "string" as const,
  description: "Use the zero-based matching element index with --selector (default 0).",
};

export const BROWSER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ["browser", "navigate"],
    category: "action",
    summary: "Navigate the shared browser to a URL.",
    description: "Open a URL through the shared safety wrapper and return its title plus bounded ARIA snapshot.",
    args: [{ name: "url", required: true }],
    run: async ({ args }) => runBrowserTool("browser_navigate", { url: args[0] }),
  },
  {
    path: ["browser", "read"],
    category: "action",
    summary: "Read the current shared browser page.",
    description: "Return the current URL and a bounded ARIA accessibility snapshot.",
    run: async () => runBrowserTool("browser_read", {}),
  },
  {
    path: ["browser", "click"],
    category: "action",
    summary: "Click by visible text, accessible name, or selector.",
    description: "Click the current page through the shared safety wrapper; use --selector for SPA-specific targeting.",
    args: [{ name: "text", required: false, variadic: true }],
    options: [
      { long: "--role", type: "string", description: "Optional ARIA role when clicking by text." },
      selectorOption,
      indexOption,
      { long: "--confirm", type: "boolean", description: "Confirm a payment-like click after human approval." },
    ],
    run: async ({ args, values }) => {
      if (values.selector) {
        return runBrowserTool("browser_click_selector", {
          selector: values.selector,
          index: parseIndex(values.index),
        });
      }
      const text = args.join(" ");
      if (!text) throw invalidUsage("Provide click text or --selector.");
      return runBrowserTool("browser_click", {
        text,
        role: values.role,
        confirm: values.confirm === true,
      });
    },
  },
  {
    path: ["browser", "type"],
    category: "action",
    summary: "Type into a field or selector.",
    description: "Type text into the current page; identify the target with --field or --selector.",
    args: [{ name: "text", required: true, variadic: true }],
    options: [
      { long: "--field", type: "string", description: "Field label, placeholder, or accessible name." },
      selectorOption,
      indexOption,
      { long: "--submit", type: "boolean", description: "Press Enter after typing." },
    ],
    run: async ({ args, values }) => {
      const text = args.join(" ");
      if (values.selector) {
        return runBrowserTool("browser_type_selector", {
          selector: values.selector,
          index: parseIndex(values.index),
          text,
          submit: values.submit === true,
        });
      }
      if (!values.field) throw invalidUsage('Provide either "--field <name>" or "--selector <css>".');
      return runBrowserTool("browser_type", {
        field: values.field,
        text,
        submit: values.submit === true,
      });
    },
  },
  {
    path: ["browser", "screenshot"],
    category: "action",
    summary: "Capture the current shared browser page.",
    description: "Write a PNG to --out and return its absolute path and dimensions in JSON mode.",
    options: [{ long: "--out", type: "string", description: "PNG output path (required)." }],
    run: async ({ values }) => runBrowserTool("browser_screenshot", {
      out: resolveScreenshotPath(values.out),
    }),
  },
];
