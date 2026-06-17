import { chromium, type BrowserContext, type Page } from "playwright";
import type { Config } from "../config/index.ts";
import type { MayaTool } from "./index.ts";

/**
 * Browser tools via Playwright.
 *
 * One persistent, VISIBLE Chromium context (logins survive) at config.browser.profileDir,
 * seeded once by Raja. Pages are perceived via the ARIA accessibility snapshot (structured
 * text — reliable for clicking) plus screenshots for visual tasks / the overlay.
 *
 * Tool names use underscores (Anthropic tool names must match [a-zA-Z0-9_-]).
 */

let ctx: BrowserContext | null = null;
let page: Page | null = null;

async function getPage(config: Config): Promise<Page> {
  if (ctx && page && !page.isClosed()) return page;
  ctx = await chromium.launchPersistentContext(config.browser.profileDir, {
    headless: config.browser.headless,
    viewport: { width: 1280, height: 800 },
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  return page;
}

export async function closeBrowser(): Promise<void> {
  await ctx?.close();
  ctx = null;
  page = null;
}

/** Trim a possibly-huge ARIA snapshot so it doesn't blow the context window. */
function trim(s: string, max = 6000): string {
  return s.length > max ? `${s.slice(0, max)}\n…[truncated]` : s;
}

export function browserTools(config: Config): Record<string, MayaTool> {
  return {
    browser_navigate: {
      spec: {
        name: "browser_navigate",
        description: "Open a URL in the browser. Returns the page title and an ARIA snapshot of the page.",
        inputSchema: {
          type: "object",
          properties: { url: { type: "string", description: "Full URL, including https://" } },
          required: ["url"],
        },
      },
      execute: async (input) => {
        const p = await getPage(config);
        await p.goto(String(input.url), { waitUntil: "domcontentloaded", timeout: 30_000 });
        const title = await p.title();
        const aria = await p.locator("body").ariaSnapshot();
        return `Navigated to ${p.url()}\nTitle: ${title}\n\nARIA snapshot:\n${trim(aria)}`;
      },
    },

    browser_read: {
      spec: {
        name: "browser_read",
        description: "Read the current page as an ARIA accessibility snapshot (structured text of roles + names).",
        inputSchema: { type: "object", properties: {} },
      },
      execute: async () => {
        const p = await getPage(config);
        const aria = await p.locator("body").ariaSnapshot();
        return `Current URL: ${p.url()}\n\nARIA snapshot:\n${trim(aria)}`;
      },
    },

    browser_click: {
      spec: {
        name: "browser_click",
        description:
          "Click an element by its visible text or accessible name. Optionally give a role (e.g. button, link) to disambiguate.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Visible text / accessible name of the element" },
            role: { type: "string", description: "Optional ARIA role, e.g. button, link, tab" },
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
        return `Clicked "${text}". Now at ${p.url()}`;
      },
    },

    browser_type: {
      spec: {
        name: "browser_type",
        description:
          "Type text into a field identified by its label, placeholder, or accessible name. Set submit=true to press Enter after.",
        inputSchema: {
          type: "object",
          properties: {
            field: { type: "string", description: "Label / placeholder / accessible name of the input" },
            text: { type: "string", description: "Text to type" },
            submit: { type: "boolean", description: "Press Enter after typing" },
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
          .first();
        await loc.fill(String(input.text), { timeout: 10_000 });
        if (input.submit === true) {
          await loc.press("Enter");
          await p.waitForLoadState("domcontentloaded").catch(() => {});
        }
        return `Typed into "${field}"${input.submit ? " and submitted" : ""}. Now at ${p.url()}`;
      },
    },

    browser_screenshot: {
      spec: {
        name: "browser_screenshot",
        description: "Capture a screenshot of the current page. Returns the saved file path.",
        inputSchema: { type: "object", properties: {} },
      },
      execute: async () => {
        const p = await getPage(config);
        const path = `/tmp/maya-shot-${Date.now()}.png`;
        await p.screenshot({ path, fullPage: false });
        return `Screenshot saved to ${path}`;
      },
    },
  };
}
