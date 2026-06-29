import { runLegacyCommand } from "./legacy.ts";
import type { CommandResult } from "./types.ts";

export const SERVE_COMMAND_SUMMARY = "Start the optional MCP stdio server.";
export const SERVE_COMMAND_DESCRIPTION =
  "Start Maya's optional MCP stdio server over the shared runTool wrapper.";
export const MCP_ALIAS_SUMMARY = "Compatibility alias for `maya serve`.";
export const MCP_ALIAS_DESCRIPTION =
  "Start Maya's optional MCP stdio server as a compatibility alias for `maya serve`.";

export async function runServeCommand(json: boolean): Promise<CommandResult | void> {
  const { startMcpServer } = await import("../mcp/server.ts");
  return runLegacyCommand(() => startMcpServer(), json);
}
