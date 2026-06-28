import type { CommandSpec } from "./types.ts";
import { CLI_VERSION } from "./types.ts";

export interface CapabilitiesContract {
  version: string;
  commands: Array<{
    name: string;
    category: string;
    summary: string;
    description: string;
    args: Array<{ name: string; required: boolean; variadic: boolean }>;
    options: Array<{ long: string; short?: string; type: string; description: string }>;
    supportsJson: boolean;
  }>;
}

export function buildCapabilities(specs: CommandSpec[]): CapabilitiesContract {
  return {
    version: CLI_VERSION,
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
        })),
        supportsJson: true,
      })),
  };
}

export function renderCapabilitiesText(contract: CapabilitiesContract): string {
  return contract.commands
    .map((command) => `${command.name}  ${command.summary}`)
    .join("\n");
}
