import { buildCapabilities, renderCapabilitiesText } from "./capabilities.ts";
import { BROWSER_COMMAND_SPECS } from "./browser.ts";
import { runDoctor } from "./doctor.ts";
import { DOC_COMMAND_SPECS } from "./docs.ts";
import { FILE_COMMAND_SPECS } from "./files.ts";
import { runFindCommand } from "./find.ts";
import { runLegacyCommand } from "./legacy.ts";
import {
  MCP_ALIAS_DESCRIPTION,
  MCP_ALIAS_SUMMARY,
  runServeCommand,
  SERVE_COMMAND_DESCRIPTION,
  SERVE_COMMAND_SUMMARY,
} from "./serve.ts";
import { TERMINAL_COMMAND_SPECS } from "./terminal.ts";
import { listCliToolSpecs, TOOL_COMMAND_SPECS } from "./tool.ts";
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
  ...BROWSER_COMMAND_SPECS,
  ...TERMINAL_COMMAND_SPECS,
  ...TOOL_COMMAND_SPECS,
  ...DOC_COMMAND_SPECS,
  ...FILE_COMMAND_SPECS,
  {
    path: ["doctor"],
    category: "diagnostic",
    summary: "Report Maya install and dependency health.",
    description: "Check Maya's core install, config, agent skill, and optional desktop dependencies.",
    run: async () => runDoctor(),
  },
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
    path: ["serve"],
    category: "mcp",
    summary: SERVE_COMMAND_SUMMARY,
    description: SERVE_COMMAND_DESCRIPTION,
    run: async ({ json }) => runServeCommand(json),
  },
  {
    path: ["mcp"],
    category: "mcp",
    summary: MCP_ALIAS_SUMMARY,
    description: MCP_ALIAS_DESCRIPTION,
    run: async ({ json }) => runServeCommand(json),
  },
  {
    path: ["setup"],
    category: "mcp",
    summary: "Install or refresh the Maya discovery skill for supported agents.",
    description: "Install Maya's generated skill for Claude Code and/or Codex, with optional MCP registration.",
    args: [{ name: "client", required: false }],
    options: [{
      long: "--with-mcp",
      type: "boolean",
      description: "Also register Maya's MCP server with the selected agent CLI.",
      defaultValue: false,
    }],
    run: async ({ json, args, values }) => {
      const { setupMcp } = await import("../mcp/setup.ts");
      return runLegacyCommand(() => setupMcp(args[0], { withMcp: values.withMcp === true }), json);
    },
  },
  {
    path: ["capabilities"],
    category: "discovery",
    summary: "Return the full Maya CLI command contract.",
    description: "List every registered CLI command, argument, and option.",
    run: async () => {
      const contract = buildCapabilities(COMMAND_SPECS, GLOBAL_OPTIONS, await listCliToolSpecs());
      return {
        text: renderCapabilitiesText(contract),
        data: contract,
      };
    },
  },
  {
    path: ["find"],
    category: "discovery",
    summary: "Search curated docs-index catalogs with bounded output.",
    description: "Search indexed Maya files, tools, docs, and commands without crawling the source tree.",
    args: [{ name: "query", required: true, variadic: true }],
    options: [
      {
        long: "--type",
        type: "string",
        description: "Restrict results to file, tool, doc, or command.",
      },
      {
        long: "--limit",
        type: "string",
        description: "Return at most this many results (default 10).",
      },
    ],
    run: async ({ args, values }) => runFindCommand(args.join(" "), {
      type: values.type,
      limit: values.limit,
    }),
  },
];
