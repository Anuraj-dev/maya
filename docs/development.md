# Development

## Requirements

- Bun `1.3.3` (declared in `package.json`)
- TypeScript 5
- Linux desktop dependencies for the capabilities being exercised
- Playwright Chromium for browser tools
- Optional Piper, sox, and PulseAudio tools for voice output
- Optional `grim`, KDE `spectacle`, or ImageMagick for desktop screenshots
- Optional `wl-copy` / `wl-paste`, `hyprctl`, `kdotool`, or `xdotool` for sensing paths

The overlay is a separate Bun package under `overlay/` and uses React, Vite, and Electron.

## Install and run

```sh
bun install
cp .env.example .env
bun src/index.ts --help
bun src/index.ts mcp
```

`bun run start` starts the daemon, not the MCP server. The MCP entry is `bun src/index.ts mcp`.

## Validation

```sh
bun test
bun run typecheck
bun run build:overlay
```

There is no root formatter or lint script in `package.json`. Do not claim formatting was run unless a
formatter is added. The root TypeScript config includes only `src`, so docs and overlay validation are
separate concerns.

## Package scripts

| Script | Behavior |
|---|---|
| `bun run start` | `bun src/index.ts start` |
| `bun run dev` | Watch and restart the daemon start command |
| `bun run typecheck` | Root `tsc --noEmit` |
| `bun run build:overlay` | Install overlay dependencies and run its build |
| `bun run start:overlay` | Run the overlay package's `start` script; note that the current overlay package has no `start` script |

The last script mismatch is existing repository behavior and should be corrected in a separate issue,
not silently changed during CLI planning.

## Environment and config

Bun auto-loads `.env`. The checked-in example documents `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`.
`GOOGLE_API_KEY` is also accepted by the config/brain path. Runtime JSON configuration is read from
`$MAYA_DIR/config.json`, defaulting to `~/.config/maya/config.json`.

Do not commit `.env`, browser profiles, audit logs, reminders, process logs, screenshots, or memory
data. These are runtime state, not source.

## Adding future CLI work

1. Preserve current commands in `src/index.ts`.
2. Add command behavior behind a testable adapter rather than expanding one monolithic file.
3. Test observable exit code/stdout/stderr behavior by spawning the CLI.
4. Keep read-only index commands independent of runtime-heavy imports.
5. Reuse tool/core execution and safety policies for action commands.
6. Update `docs-index/commands.json` and relevant maps in the same change.
