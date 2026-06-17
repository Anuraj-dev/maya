#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program
  .name("maya")
  .description("A female Jarvis-like voice agent — listen, ask, execute, report.")
  .version("0.0.0");

program
  .command("start")
  .description("Start the Maya daemon")
  .option("--no-overlay", "run the daemon without launching the overlay")
  .action(async (opts) => {
    const { startDaemon } = await import("./daemon/service.ts");
    await startDaemon({ overlay: opts.overlay });
  });

program
  .command("stop")
  .description("Stop the Maya daemon")
  .action(async () => {
    const { stopDaemon } = await import("./daemon/service.ts");
    await stopDaemon();
  });

program
  .command("status")
  .description("Show daemon status")
  .action(async () => {
    const { daemonStatus } = await import("./daemon/service.ts");
    await daemonStatus();
  });

program
  .command("live")
  .description("Run one command with the overlay wired in live (eyes + task queue react in real time)")
  .argument("<command...>", "the command, e.g. open example.com and read the heading")
  .option("-p, --provider <name>", "brain provider: anthropic | gemini (free) | ollama (offline)")
  .action(async (parts: string[], opts: { provider?: "anthropic" | "gemini" | "ollama" }) => {
    const { runLive } = await import("./overlay/live-run.ts");
    await runLive(parts.join(" "), { provider: opts.provider });
  });

program
  .command("ping")
  .description("Cheap smoke test: verify the Anthropic key with one tiny Haiku call (~fractions of a cent)")
  .action(async () => {
    const { pingAnthropic } = await import("./brain/ping.ts");
    await pingAnthropic();
  });

program
  .command("ask")
  .description("Phase-1 dev entry: send one command to the agent from the terminal")
  .argument("<command...>", "the command, e.g. open github.com and list my open PRs")
  .option(
    "-p, --provider <name>",
    "brain provider: anthropic | gemini (free) | ollama (offline)",
  )
  .action(async (parts: string[], opts: { provider?: "anthropic" | "gemini" | "ollama" }) => {
    const { runOnce } = await import("./agent/loop.ts");
    await runOnce(parts.join(" "), { provider: opts.provider });
  });

program.parseAsync();
