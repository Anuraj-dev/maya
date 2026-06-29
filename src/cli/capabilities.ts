import type { CommandSpec, GlobalOptionSpec } from "./types.ts";
import type { ToolSpec } from "../tools/index.ts";
import { CLI_VERSION } from "./types.ts";

export interface CapabilitiesContract {
  version: string;
  globalOptions: Array<{ long: string; short?: string; description: string }>;
  commands: Array<{
    name: string;
    category: string;
    summary: string;
    description: string;
    args: Array<{ name: string; required: boolean; variadic: boolean }>;
    options: Array<{
      long: string;
      short?: string;
      type: string;
      description: string;
      defaultValue?: boolean | string;
      negates?: string;
    }>;
    supportsJson: boolean;
  }>;
  tools: Array<{
    name: string;
    description: string;
    command: string;
  }>;
}

export function buildCapabilities(
  specs: CommandSpec[],
  globalOptions: GlobalOptionSpec[],
  tools: ToolSpec[] = [],
): CapabilitiesContract {
  return {
    version: CLI_VERSION,
    globalOptions: globalOptions.map(({ long, short, description }) => ({
      long,
      short,
      description,
    })),
    commands: [...specs]
      .sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")))
      .map((spec) => ({
        name: `maya ${spec.path.join(" ")}`,
        category: spec.category,
        summary: spec.summary,
        description: spec.description,
        args: (spec.args ?? []).map((arg) => ({
          name: arg.name,
          required: arg.required !== false,
          variadic: arg.variadic === true,
        })),
        options: (spec.options ?? []).map((option) => ({
          long: option.long,
          short: option.short,
          type: option.type,
          description: option.description,
          defaultValue: option.defaultValue,
          negates: option.negates,
        })),
        supportsJson: true,
      })),
    tools: [...tools]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, description }) => ({
        name,
        description,
        command: `maya tool call ${name}`,
      })),
  };
}

export function renderCapabilitiesText(contract: CapabilitiesContract): string {
  return [
    ...contract.commands.map((command) => `${command.name}  ${command.summary}`),
    ...contract.tools.map((tool) => `${tool.command}  ${tool.description}`),
  ].join("\n");
}
