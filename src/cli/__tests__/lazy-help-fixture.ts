const forbidden = /(?:daemon\/service|mcp\/server|proactive\/reminders|tools\/browser|voice\/tts)\.ts$/;

Bun.plugin({
  name: "reject-heavy-help-imports",
  setup(build) {
    build.onLoad({ filter: forbidden }, ({ path }) => {
      throw new Error(`help eagerly loaded ${path}`);
    });
  },
});

const { runCli } = await import("../run.ts");
process.exitCode = await runCli(process.argv.slice(2));
