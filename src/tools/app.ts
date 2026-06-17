/**
 * app_open — launch a desktop application or open a file/URL with its default handler.
 *
 * Uses xdg-open on Linux (the standard portal). App names are fuzzy-matched against common
 * launchers so you can say "open Obsidian" without knowing the exact binary name.
 */
import type { MayaTool } from "./index.ts";

const KNOWN_APPS: Record<string, string> = {
  obsidian: "obsidian",
  terminal: "kitty",
  kitty: "kitty",
  alacritty: "alacritty",
  firefox: "firefox",
  chrome: "google-chrome-stable",
  "google chrome": "google-chrome-stable",
  chromium: "chromium-browser",
  code: "code",
  vscode: "code",
  "visual studio code": "code",
  discord: "discord",
  spotify: "spotify",
  thunar: "thunar",
  nautilus: "nautilus",
  files: "nautilus",
  "file manager": "thunar",
};

function resolveApp(name: string): string {
  const key = name.toLowerCase().trim();
  return KNOWN_APPS[key] ?? name;
}

export const appTools: Record<string, MayaTool> = {
  app_open: {
    spec: {
      name: "app_open",
      description:
        "Open a desktop application by name, or open a file/URL with its default handler via xdg-open. " +
        "Use for launching apps like Obsidian, Firefox, a terminal, VS Code, etc. " +
        "For URLs, prefer browser_navigate which returns the page content. " +
        "app_open is best for native apps that don't have a browser equivalent.",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description:
              "Application name (e.g. 'obsidian', 'terminal', 'firefox') or a file/URL to open " +
              "with its default handler.",
          },
        },
        required: ["target"],
      },
    },
    execute: async (input) => {
      const raw = String(input.target ?? "").trim();
      if (!raw) return "No target provided.";

      const target = resolveApp(raw);
      const proc = Bun.spawn(target.startsWith("/") || target.includes("://")
        ? ["xdg-open", target]
        : [target], {
        stdout: "ignore",
        stderr: "pipe",
        detached: true,
      });
      proc.unref();

      // Brief wait to catch immediate launch errors
      const exitCode = await Promise.race([
        proc.exited,
        new Promise<null>((r) => setTimeout(() => r(null), 600)),
      ]);

      if (exitCode === null) return `Launched ${raw}.`;
      if (exitCode === 0) return `Opened ${raw}.`;
      const stderr = await new Response(proc.stderr).text();
      return `Failed to open ${raw} (exit ${exitCode}): ${stderr.trim() || "unknown error"}`;
    },
  },
};
