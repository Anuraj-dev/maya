Bun.plugin({
  name: "fixture-tool-registry",
  setup(build) {
    build.onLoad({ filter: /tools\/index\.ts$/ }, () => ({
      loader: "ts",
      contents: `
        export function buildTools() {
          return {
            echo: {
              spec: {
                name: "echo",
                description: "Return the supplied text.",
                inputSchema: {
                  type: "object",
                  properties: { text: { type: "string" } },
                  required: ["text"],
                },
              },
              execute: async (input: Record<string, unknown>) => String(input.text ?? ""),
            },
            image: {
              returnsImage: true,
              spec: {
                name: "image",
                description: "Return a generated PNG path.",
                inputSchema: { type: "object", properties: {}, required: [] },
              },
              execute: async () => {
                const path = (process.env.HOME ?? "/tmp") + "/fixture.png";
                const bytes = new Uint8Array(24);
                bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
                bytes.set([0x49, 0x48, 0x44, 0x52], 12);
                const view = new DataView(bytes.buffer);
                view.setUint32(16, 3);
                view.setUint32(20, 2);
                await Bun.write(path, bytes);
                return path;
              },
            },
            shell_run: {
              spec: {
                name: "shell_run",
                description: "Run a shell command.",
                inputSchema: {
                  type: "object",
                  properties: { command: { type: "string" }, confirm: { type: "boolean" } },
                  required: ["command"],
                },
              },
              execute: async () => "executed",
            },
          };
        }
      `,
    }));
  },
});

const { runCli } = await import("../run.ts");
process.exitCode = await runCli(process.argv.slice(2));
