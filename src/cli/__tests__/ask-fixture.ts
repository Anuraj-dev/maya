Bun.plugin({
  name: "capture-run-once",
  setup(build) {
    build.onLoad({ filter: /agent\/loop\.ts$/ }, () => ({
      loader: "ts",
      contents: `
        export async function runOnce(command: string, options: unknown): Promise<void> {
          console.log(JSON.stringify({ command, options }));
        }
      `,
    }));
  },
});

const { runCli } = await import("../run.ts");
process.exitCode = await runCli(process.argv.slice(2));
