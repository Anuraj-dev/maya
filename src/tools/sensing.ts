/**
 * Sensing tools — give the agent eyes, ears, and clipboard access on the local machine.
 *
 * screenshot: grim (Wayland, preferred) → spectacle (KDE) → ImageMagick import (X11)
 * clipboard_read/write: wl-paste / wl-copy (Wayland clipboard)
 * get_context: hyprctl (Hyprland) → kdotool (KDE Plasma) → xdotool (X11)
 */
import { join } from "node:path";
import type { MayaTool } from "./index.ts";
import { MAYA_DIR } from "../config/index.ts";

const TMP_DIR = join(MAYA_DIR, "screenshots");

async function ensureTmpDir(): Promise<void> {
  await Bun.spawn(["mkdir", "-p", TMP_DIR]).exited;
}

export const sensingTools: Record<string, MayaTool> = {
  screenshot: {
    returnsImage: true,
    spec: {
      name: "screenshot",
      description:
        "Capture the current screen so you can SEE what the user is looking at right now. " +
        "The image is returned to you directly (not just a path). " +
        "Requires grim (install: sudo dnf install grim) on Wayland.",
      inputSchema: {
        type: "object",
        properties: {
          output: {
            type: "string",
            description: "Optional output path. Defaults to ~/.config/maya/screenshots/<timestamp>.png",
          },
        },
        required: [],
      },
    },
    execute: async (input) => {
      await ensureTmpDir();
      const outPath =
        typeof input.output === "string"
          ? input.output
          : join(TMP_DIR, `screen-${Date.now()}.png`);

      // Prefer grim (Wayland-native), fall back to import (ImageMagick, X11)
      const grim = await Bun.which("grim");
      const importBin = await Bun.which("import");

      if (grim) {
        const proc = Bun.spawn([grim, outPath], { stdout: "ignore", stderr: "pipe" });
        await proc.exited;
        const err = await new Response(proc.stderr).text();
        if (proc.exitCode !== 0) return `Screenshot failed: ${err.trim()}`;
      } else {
        // grim not found — try KDE spectacle, then ImageMagick import (X11)
        const spectacle = await Bun.which("spectacle");
        const used = spectacle
          ? Bun.spawn([spectacle, "--background", "--nonotify", "--output", outPath], {
              stdout: "ignore",
              stderr: "pipe",
            })
          : importBin
            ? Bun.spawn([importBin, "-window", "root", outPath], {
                stdout: "ignore",
                stderr: "pipe",
              })
            : null;

        if (!used) {
          return (
            "Screenshot unavailable: install grim (sudo dnf install grim) for Wayland, " +
            "or spectacle for KDE (sudo dnf install spectacle)."
          );
        }
        await used.exited;
        const err = await new Response(used.stderr).text();
        if (used.exitCode !== 0) return `Screenshot failed: ${err.trim()}`;
      }

      // Return the bare path: returnsImage front-ends read it back as an image content block;
      // text-only callers still get a usable path.
      return outPath;
    },
  },

  clipboard_read: {
    spec: {
      name: "clipboard_read",
      description: "Read the current clipboard contents (text). Returns what the user last copied.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    execute: async () => {
      const proc = Bun.spawn(["wl-paste", "--no-newline"], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env },
      });
      await proc.exited;
      if (proc.exitCode !== 0) {
        const err = await new Response(proc.stderr).text();
        if (err.includes("nothing is copied")) return "(clipboard is empty)";
        return `clipboard_read failed: ${err.trim()}`;
      }
      const text = await new Response(proc.stdout).text();
      return text || "(clipboard is empty)";
    },
  },

  clipboard_write: {
    spec: {
      name: "clipboard_write",
      description: "Write text to the clipboard so the user can paste it anywhere.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text to place on the clipboard." },
        },
        required: ["text"],
      },
    },
    execute: async (input) => {
      const text = String(input.text ?? "");
      const proc = Bun.spawn(["wl-copy"], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "pipe",
        env: { ...process.env },
      });
      proc.stdin.write(text);
      proc.stdin.end();
      await proc.exited;
      if (proc.exitCode !== 0) {
        const err = await new Response(proc.stderr).text();
        return `clipboard_write failed: ${err.trim()}`;
      }
      return `Copied to clipboard (${text.length} chars).`;
    },
  },

  get_context: {
    spec: {
      name: "get_context",
      description:
        "Get the currently active window title and class. " +
        "Use this to understand what the user is focused on right now.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    execute: async () => {
      // Hyprland
      const hyprctl = await Bun.which("hyprctl");
      if (hyprctl) {
        const proc = Bun.spawn([hyprctl, "activewindow", "-j"], {
          stdout: "pipe",
          stderr: "ignore",
        });
        await proc.exited;
        if (proc.exitCode === 0) {
          try {
            const json = JSON.parse(await new Response(proc.stdout).text());
            return `Active window: "${json.title}" (class: ${json.class})`;
          } catch {
            // fall through
          }
        }
      }

      // KDE Plasma (Wayland or X11) via kdotool
      const kdotool = await Bun.which("kdotool");
      if (kdotool) {
        const idProc = Bun.spawn([kdotool, "getactivewindow"], {
          stdout: "pipe",
          stderr: "ignore",
        });
        await idProc.exited;
        if (idProc.exitCode === 0) {
          const wid = (await new Response(idProc.stdout).text()).trim();
          if (wid) {
            const [nameProc, classProc] = [
              Bun.spawn([kdotool, "getwindowname", wid], { stdout: "pipe", stderr: "ignore" }),
              Bun.spawn([kdotool, "getwindowclassname", wid], { stdout: "pipe", stderr: "ignore" }),
            ];
            await Promise.all([nameProc.exited, classProc.exited]);
            const title = (await new Response(nameProc.stdout).text()).trim();
            const cls = (await new Response(classProc.stdout).text()).trim();
            return cls
              ? `Active window: "${title}" (class: ${cls})`
              : `Active window: "${title}"`;
          }
        }
      }

      // X11 fallback
      const xdotool = await Bun.which("xdotool");
      if (xdotool) {
        const proc = Bun.spawn(
          ["/bin/sh", "-c", "xdotool getactivewindow getwindowname"],
          { stdout: "pipe", stderr: "ignore" },
        );
        await proc.exited;
        if (proc.exitCode === 0) {
          const title = (await new Response(proc.stdout).text()).trim();
          return `Active window: "${title}"`;
        }
      }

      return "Could not determine active window (no compositor tools found: hyprctl, kdotool, xdotool).";
    },
  },
};
