import { chromium, type BrowserContext, type Page } from "playwright";
import type { Config } from "../config/index.ts";
import type { MayaTool } from "./index.ts";

/**
 * Browser tools via Playwright.
 *
 * One persistent, VISIBLE Chromium context (logins survive) at config.browser.profileDir,
 * seeded once by Raja. Pages are perceived via the ARIA accessibility snapshot (structured
 * text — reliable for simple pages) OR CSS-selector / JS tools (reliable for SPAs like
 * WhatsApp / Gmail where ARIA is incomplete or truncated).
 *
 * Tool names use underscores (Anthropic tool names must match [a-zA-Z0-9_-]).
 */

let ctx: BrowserContext | null = null;
let page: Page | null = null;

async function getPage(config: Config): Promise<Page> {
  if (ctx && page && !page.isClosed()) return page;
  ctx = await chromium.launchPersistentContext(config.browser.profileDir, {
    headless: config.browser.headless,
    viewport: null, // use the real window size — avoids WhatsApp/Gmail layout breakage
    args: ["--window-size=1440,900"],
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  return page;
}

export async function closeBrowser(): Promise<void> {
  await ctx?.close();
  ctx = null;
  page = null;
}

function trim(s: string, max = 8000): string {
  return s.length > max ? `${s.slice(0, max)}\n…[truncated — use browser_eval to inspect specific parts]` : s;
}

export function browserTools(config: Config): Record<string, MayaTool> {
  return {
    browser_navigate: {
      spec: {
        name: "browser_navigate",
        description: "Open a URL in the browser. Returns the page title and an ARIA snapshot.",
        inputSchema: {
          type: "object",
          properties: { url: { type: "string", description: "Full URL including https://" } },
          required: ["url"],
        },
      },
      execute: async (input) => {
        const p = await getPage(config);
        await p.goto(String(input.url), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await p.waitForTimeout(1500); // let SPAs finish rendering
        const title = await p.title();
        const aria = await p.locator("body").ariaSnapshot();
        return `Navigated to ${p.url()}\nTitle: ${title}\n\nARIA snapshot:\n${trim(aria)}`;
      },
    },

    browser_read: {
      spec: {
        name: "browser_read",
        description:
          "Read the current page as an ARIA accessibility snapshot. " +
          "If the snapshot is truncated or doesn't show the element you need, use browser_eval to query the DOM directly.",
        inputSchema: { type: "object", properties: {} },
      },
      execute: async () => {
        const p = await getPage(config);
        await p.waitForTimeout(500);
        const aria = await p.locator("body").ariaSnapshot();
        return `Current URL: ${p.url()}\n\nARIA snapshot:\n${trim(aria)}`;
      },
    },

    browser_click: {
      spec: {
        name: "browser_click",
        description:
          "Click an element by its visible text or accessible name. " +
          "If this fails, use browser_click_selector with a CSS selector instead.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Visible text / accessible name of the element" },
            role: { type: "string", description: "Optional ARIA role, e.g. button, link, listitem" },
          },
          required: ["text"],
        },
      },
      execute: async (input) => {
        const p = await getPage(config);
        const text = String(input.text);
        const loc = input.role
          ? p.getByRole(input.role as Parameters<Page["getByRole"]>[0], { name: text })
          : p.getByText(text, { exact: false }).first();
        await loc.click({ timeout: 10_000 });
        await p.waitForLoadState("domcontentloaded").catch(() => {});
        await p.waitForTimeout(500);
        return `Clicked "${text}". Now at ${p.url()}`;
      },
    },

    browser_click_selector: {
      spec: {
        name: "browser_click_selector",
        description:
          "Click an element using a CSS selector. More reliable than browser_click for SPAs like WhatsApp. " +
          "Examples: 'footer [contenteditable]' (WhatsApp message box), '[data-testid=\"send\"]' (send button), " +
          "'[aria-label=\"Search input textbox\"]' (WhatsApp search).",
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector for the element to click" },
            index: { type: "number", description: "If multiple elements match, click the Nth one (0-based, default 0)" },
          },
          required: ["selector"],
        },
      },
      execute: async (input) => {
        const p = await getPage(config);
        const selector = String(input.selector);
        const idx = typeof input.index === "number" ? input.index : 0;
        const loc = p.locator(selector).nth(idx);
        await loc.waitFor({ timeout: 10_000 });
        await loc.click({ timeout: 10_000 });
        await p.waitForTimeout(300);
        return `Clicked selector "${selector}" (index ${idx}). Now at ${p.url()}`;
      },
    },

    browser_type: {
      spec: {
        name: "browser_type",
        description:
          "Type text into a field by its label, placeholder, or aria-label. " +
          "For WhatsApp message box: field='Type a message'. " +
          "If this fails, use browser_type_selector with a CSS selector instead.",
        inputSchema: {
          type: "object",
          properties: {
            field: { type: "string", description: "Label / placeholder / aria-label of the input. WhatsApp message box: 'Type a message'." },
            text: { type: "string", description: "Text to type" },
            submit: { type: "boolean", description: "Press Enter after typing (sends WhatsApp message, submits form, etc.)" },
          },
          required: ["field", "text"],
        },
      },
      execute: async (input) => {
        const p = await getPage(config);
        const field = String(input.field);
        const loc = p
          .getByLabel(field)
          .or(p.getByPlaceholder(field))
          .or(p.getByRole("textbox", { name: field }))
          .or(p.locator(`[aria-label="${field}"]`))
          .or(p.locator(`[aria-placeholder="${field}"]`))
          .first();
        try {
          await loc.fill(String(input.text), { timeout: 10_000 });
        } catch {
          await loc.click({ timeout: 10_000 });
          await loc.pressSequentially(String(input.text), { delay: 20 });
        }
        if (input.submit === true) {
          await loc.press("Enter");
          await p.waitForTimeout(500);
        }
        return `Typed into "${field}"${input.submit ? " and submitted" : ""}`;
      },
    },

    browser_type_selector: {
      spec: {
        name: "browser_type_selector",
        description:
          "Type into an element found by CSS selector. Use this for WhatsApp, Gmail, and other SPAs " +
          "where browser_type fails. " +
          "WhatsApp message input selector: 'footer [contenteditable=\"true\"]'. " +
          "Set submit=true to press Enter (sends the message).",
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector for the input/contenteditable element" },
            text: { type: "string", description: "Text to type" },
            submit: { type: "boolean", description: "Press Enter after typing" },
            index: { type: "number", description: "If multiple elements match, use the Nth one (0-based, default 0)" },
          },
          required: ["selector", "text"],
        },
      },
      execute: async (input) => {
        const p = await getPage(config);
        const selector = String(input.selector);
        const idx = typeof input.index === "number" ? input.index : 0;
        const loc = p.locator(selector).nth(idx);
        await loc.waitFor({ timeout: 10_000 });
        try {
          await loc.fill(String(input.text), { timeout: 5_000 });
        } catch {
          await loc.click({ timeout: 5_000 });
          await loc.pressSequentially(String(input.text), { delay: 20 });
        }
        if (input.submit === true) {
          await p.keyboard.press("Enter");
          await p.waitForTimeout(500);
        }
        return `Typed into "${selector}"${input.submit ? " and sent" : ""}`;
      },
    },

    browser_press_key: {
      spec: {
        name: "browser_press_key",
        description: "Press a keyboard key. Use to send a message (Enter), close a dialog (Escape), etc.",
        inputSchema: {
          type: "object",
          properties: {
            key: { type: "string", description: "Key name: Enter, Escape, Tab, Backspace, ArrowDown, etc." },
          },
          required: ["key"],
        },
      },
      execute: async (input) => {
        const p = await getPage(config);
        await p.keyboard.press(String(input.key));
        return `Pressed ${input.key}`;
      },
    },

    browser_eval: {
      spec: {
        name: "browser_eval",
        description:
          "Run JavaScript in the current page and return the result. " +
          "Use to inspect the DOM, find elements, or interact when other tools fail. " +
          "Examples: " +
          "- Find WhatsApp input: 'document.querySelector(\"footer [contenteditable]\")?.ariaPlaceholder' " +
          "- Get all buttons: 'Array.from(document.querySelectorAll(\"button\")).map(b => b.innerText).slice(0,20)' " +
          "- Click by selector: 'document.querySelector(\"footer [contenteditable]\").focus()' " +
          "Return value is JSON-serialised (non-serialisable values become null).",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string", description: "JavaScript expression to evaluate in the page context" },
          },
          required: ["code"],
        },
      },
      execute: async (input) => {
        const p = await getPage(config);
        try {
          const result = await p.evaluate(String(input.code));
          return `Result: ${JSON.stringify(result)}`;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    browser_scroll: {
      spec: {
        name: "browser_scroll",
        description:
          "Scroll the page or a specific element. " +
          "Use direction 'down'/'up' to scroll by pixels, or 'top'/'bottom' to jump to page edges. " +
          "Optionally target a CSS selector to scroll a specific scrollable container.",
        inputSchema: {
          type: "object",
          properties: {
            direction: {
              type: "string",
              enum: ["down", "up", "top", "bottom"],
              description: "'down' or 'up' scrolls by `pixels` (default 500). 'top'/'bottom' jumps to page edge.",
            },
            pixels: {
              type: "number",
              description: "How many pixels to scroll (for 'up'/'down'). Default: 500.",
            },
            selector: {
              type: "string",
              description: "CSS selector of a scrollable container. Omit to scroll the page.",
            },
          },
          required: ["direction"],
        },
      },
      execute: async (input) => {
        const p = await getPage(config);
        const dir = String(input.direction);
        const px = typeof input.pixels === "number" ? input.pixels : 500;
        const sel = typeof input.selector === "string" ? input.selector : null;

        if (dir === "top" || dir === "bottom") {
          const script = sel
            ? `const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.scrollTop = ${dir === "top" ? "0" : "el.scrollHeight"};`
            : `window.scrollTo(0, ${dir === "top" ? "0" : "document.body.scrollHeight"});`;
          await p.evaluate(script);
          return `Scrolled to ${dir}${sel ? ` of "${sel}"` : ""}.`;
        }

        const delta = dir === "down" ? px : -px;
        const script = sel
          ? `const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.scrollBy(0, ${delta});`
          : `window.scrollBy(0, ${delta});`;
        await p.evaluate(script);
        await p.waitForTimeout(300);
        return `Scrolled ${dir} by ${px}px${sel ? ` in "${sel}"` : ""}.`;
      },
    },

    browser_screenshot: {
      returnsImage: true,
      spec: {
        name: "browser_screenshot",
        description: "Capture a screenshot of the current page so you can SEE it. The image is returned to you directly.",
        inputSchema: { type: "object", properties: {} },
      },
      execute: async () => {
        const p = await getPage(config);
        const path = `/tmp/maya-shot-${Date.now()}.png`;
        await p.screenshot({ path, fullPage: false });
        // Bare path: the MCP server reads it back as an image content block (returnsImage).
        return path;
      },
    },
  };
}
