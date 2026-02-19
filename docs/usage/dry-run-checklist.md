# Real-World Dry Run Checklist

Use this checklist before first production usage.

## 1) Environment and config

- Confirm Bun version: `bun --version` (must satisfy `.bun-version`).
- Confirm bridge tokens and IDs are set in your env/config.
- Confirm OpenCode config context is what you expect (nearest `.opencode/` directory is preferred; otherwise nearest `opencode.json`).

## 2) Static quality checks

- Run `bun run lint`.
- Run `bun run test`.
- Run `bun run build`.

Expected: all three pass.

## 3) Runtime diagnostics

- Run `bun run doctor`.
- Run `bun run bridge:test`.

Expected:

- enabled bridges report healthy connectivity.
- configured paths match intended runtime/database locations.

## 4) Command registration validation

- Start runtime: `bun run start`.
- Check startup logs for:
  - discovered OpenCode markdown commands
  - per-bridge command registration count
- In bridge client (Telegram/Discord), verify slash command menu contains:
  - native BUI commands (`start`, `new`, `cd`, `cwd`, `session`, `health`, `pid`, `agent`)
  - discovered OpenCode commands from command markdown files

## 5) Functional flow validation

- Send plain text prompt and verify OpenCode reply.
- Run `/help` and one custom OpenCode command discovered from markdown.
- Run `/new` then `/cwd` and `/session` to verify state updates.
- If enabled, test media upload and screenshot workflow (`/screenshot`).

## 6) Shutdown behavior

- Stop process with Ctrl+C.
- Restart and verify bridge reconnects cleanly and command registration remains consistent.

## Troubleshooting

- **No discovered commands registered**: ensure command files exist in `commands/` or `.opencode/commands/` under the active OpenCode config directory.
- **Unexpected command names**: command names are normalized from markdown filenames (`-` becomes `_`, non-alphanumeric characters are removed, max length 32).
- **Name collisions**: if two files normalize to the same command, first discovered file wins and a warning is logged.
- **Bridge command menu not updating**: ensure bridge sync mode is enabled (`telegram.commands.registerOnStart=true`, `discord.commandSyncMode=on-start`).
- **Bridge health fails**: rerun `bun run bridge:test --bridge <name> --timeout 5000` and validate token/application IDs.
