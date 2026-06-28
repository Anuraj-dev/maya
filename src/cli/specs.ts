import { buildCapabilities, renderCapabilitiesText } from "./capabilities.ts";
import { runLegacyCommand } from "./legacy.ts";
import type { CommandSpec, GlobalOptionSpec } from "./types.ts";

export const GLOBAL_OPTIONS: GlobalOptionSpec[] = [
  { key: "help", long: "--help", short: "-h", description: "Show help." },
  { key: "json", long: "--json", description: "Emit the versioned JSON envelope." },
  { key: "version", long: "--version", short: "-V", description: "Show the Maya version." },
];

const providerOption = {
  long: "--provider",
  short: "-p",
  type: "string" as const,
  description: "Brain provider: anthropic | gemini | ollama",
};

export const COMMAND_SPECS: CommandSpec[] = [
  {
    path: ["start"],
    category: "runtime",
    summary: "Start the Maya daemon.",
    description: "Start the Maya daemon and optionally skip the overlay.",
    options: [
      {
        long: "--no-overlay",
        type: "boolean",
        description: "Run the daemon without launching the overlay.",
        defaultValue: true,
        negates: "overlay",
      },
    ],
    run: async ({ json, values }) => {
      const { startDaemon } = await import("../daemon/service.ts");
      return runLegacyCommand(() => startDaemon({ overlay: values.overlay !== false }), json);
    },
  },
  {
    path: ["stop"],
    category: "runtime",
    summary: "Stop the Maya daemon.",
    description: "Stop the Maya daemon if it is running.",
    run: async ({ json }) => {
      const { stopDaemon } = await import("../daemon/service.ts");
      return runLegacyCommand(() => stopDaemon(), json);
    },
  },
  {
    path: ["status"],
    category: "runtime",
    summary: "Show daemon status.",
    description: "Report the Maya daemon status.",
    run: async ({ json }) => {
      const { daemonStatus } = await import("../daemon/service.ts");
      return runLegacyCommand(() => daemonStatus(), json);
    },
  },
  {
    path: ["live"],
    category: "legacy-agent",
    summary: "Run one command with the live overlay bridge.",
    description: "Run one legacy agent command with the live overlay wired in.",
    args: [{ name: "command", required: true, variadic: true }],
    options: [providerOption],
    run: async ({ json, args, values }) => {
      const { runLive } = await import("../overlay/live-run.ts");
      return runLegacyCommand(
        () => runLive(args.join(" "), { provider: values.provider as "anthropic" | "gemini" | "ollama" | undefined }),
        json,
      );
    },
  },
  {
    path: ["ping"],
    category: "diagnostic",
    summary: "Verify the Anthropic key with a cheap API call.",
    description: "Run the small Anthropic connectivity check.",
    run: async ({ json }) => {
      const { pingAnthropic } = await import("../brain/ping.ts");
      return runLegacyCommand(() => pingAnthropic(), json);
    },
  },
  {
    path: ["ask"],
    category: "legacy-agent",
    summary: "Run one command through Maya's in-process agent loop.",
    description: "Run one terminal command through Maya's legacy in-process agent loop.",
    args: [{ name: "command", required: true, variadic: true }],
    options: [providerOption],
    run: async ({ json, args, values }) => {
      const { runOnce } = await import("../agent/loop.ts");
      return runLegacyCommand(
        () => runOnce(args.join(" "), { provider: values.provider as "anthropic" | "gemini" | "ollama" | undefined }),
        json,
      );
    },
  },
  {
    path: ["mcp"],
    category: "mcp",
    summary: "Start the MCP stdio server.",
    description: "Start Maya as an MCP stdio server.",
    run: async ({ json }) => {
      const { startMcpServer } = await import("../mcp/server.ts");
      return runLegacyCommand(() => startMcpServer(), json);
    },
  },
  {
    path: ["setup"],
    category: "mcp",
    summary: "Register Maya with supported coding-agent MCP clients.",
    description: "Register Maya with Claude Code and/or Codex MCP client config.",
    args: [{ name: "client", required: false }],
    run: async ({ json, args }) => {
      const { setupMcp } = await import("../mcp/setup.ts");
      return runLegacyCommand(() => setupMcp(args[0]), json);
    },
  },
  {
    path: ["capabilities"],
    category: "discovery",
    summary: "Return the full Maya CLI command contract.",
    description: "List every registered CLI command, argument, and option.",
    run: async () => {
      const contract = buildCapabilities(COMMAND_SPECS, GLOBAL_OPTIONS);
      return {
        text: renderCapabilitiesText(contract),
        data: contract,
      };
    },
  },
];
