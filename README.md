# OpenCode BUI

OpenCode BUI (Bot User Interface) is a standalone CLI application that exposes OpenCode sessions through bot bridges.

Current bridges: Telegram and Discord (enable per config).

## Why standalone

- Independent lifecycle from OpenCode plugin reloads.
- Better hot reload and operational diagnostics.
- Foundation for multiple frontends (Telegram now, Discord next).

## Features

- One Telegram chat maps to one OpenCode session.
- Slash parity: forwards unknown slash commands to OpenCode (`/help`, `/init`, `/undo`, `/redo`, ...).
- BUI-native commands:
  - `/new [path]`
  - `/cd <path>`
  - `/cwd`
  - `/session`
  - `/screenshot [note]`
  - `/reload`
  - `/pid`
  - `/health`
  - `/agent list | new | run`
- Offline backlog resolution (`all`, `latest`, override with fresh message).
- Screenshot capture + Telegram send + OpenCode analysis.
- Local image ingestion and forwarding.

## Stack

- TypeScript (Bun runtime)
- Bun runtime for local execution (`bun --watch`, `bun run`)
- `grammy` for Telegram
- `cac` for CLI
- `c12` + `defu` for layered config loading/merging
- `effect` for core runtime orchestration
- `@opencode-ai/sdk` for OpenCode session/runtime integration
- `@libsql/client` + `drizzle-orm` for local LibSQL storage
- `pino` + `pino-pretty` for structured logs with pretty local output
- `vite` / `vitest` for tooling and tests
- `zod` for runtime configuration validation
- `vitest` for unit tests
- `oxlint` + `oxfmt` for linting/formatting

## Project layout

- `src/bin/opencode-bui.ts`: CLI entrypoint
- `src/core/domain/*`: bridge-agnostic contracts and schemas
- `src/core/ports/*`: interfaces only
- `src/core/application/*`: runtime orchestration and routers
- `src/infra/*`: config loader, LibSQL stores, lock, OpenCode adapter
- `src/bridges/telegram/*`: Telegram SDK edge adapter
- `src/bridges/discord/*`: Discord SDK edge adapter scaffold
- `test/*`: unit tests

Bridge modules own bridge-specific behavior through definitions (config validation rules, onboarding prompts/template blocks, and health checks), while core stays bridge-agnostic.

File naming convention uses: `*.schema.ts`, `*.types.ts`, `*.utils.ts`, `*.test.ts`.

Database policy:

- If local LibSQL is introduced, use Drizzle ORM as the integration layer.

Import aliases are available:

- `@bin/*`
- `@core/*`
- `@infra/*`
- `@bridges/*`

## Install

Use Bun (this is a Bun-first application):

```bash
bun --version
```

Minimum supported Bun version: `1.3.9` (see `.bun-version`).

```bash
bun install
```

`opencode-bui` runs TypeScript directly on Bun (no `tsc` compile step required for normal usage).
Use `bun run build` only if you want a bundled output in `dist/bin`.

Optional global command on your machine:

```bash
bun link
```

Then run:

```bash
bun run start
```

## Development

```bash
bun run dev
```

This runs the CLI with Bun watch mode.

Standalone Telegram bridge dev entry:

```bash
bun run dev:telegram
```

Diagnostics:

```bash
bun run doctor
bun run bridge:test
```

Lint and format:

```bash
bun run lint
bun run format
```

Database migrations:

```bash
bun run db:generate
bun run db:migrate
```

Onboarding wizard:

```bash
opencode-bui onboard
```

## Tests

```bash
bun run test
```

## Environment

`opencode-bui` resolves config in this order:

1. nearest working directory config (`opencode-bui.config.*`)
2. nearest OpenCode config directory (`opencode.json`) and its `bui/` folder
3. global `~/.config/opencode/bui`
4. environment overrides

Use `~/.config/opencode/bui/.env` (preferred) or project `.env`.

You can also define typed app config with `c12`, for example `opencode-bui.config.ts`:

```ts
export default {
  runtimeDir: "~/.config/opencode/bui",
  dbPath: "~/.config/opencode/bui/opencode-bui.db",
  opencodeBin: "opencode",
  opencodeAttachUrl: process.env.OPENCODE_ATTACH_URL || undefined,
  bridges: {
    telegram: {
      enabled: true,
      allowedUsers: "@your_username,123456789",
      backlogStaleSeconds: 45,
    },
    discord: {
      enabled: false,
      token: "",
      applicationId: "",
    },
  },
}
```

Environment variables still override config file values.

Key variables:

- `TELEGRAM_BOT_TOKEN` (required when `bridges.telegram.enabled=true`)
- `TELEGRAM_ALLOWED_USERS` (optional, comma-separated usernames and/or numeric IDs)
- `TELEGRAM_ALLOWED_USER_IDS` (optional, legacy comma-separated numeric IDs)
- `DISCORD_BOT_TOKEN` (required when `bridges.discord.enabled=true`)
- `DISCORD_APPLICATION_ID` (optional)
- `OPENCODE_BIN` (optional, default `opencode`)
- `OPENCODE_ATTACH_URL` (optional, attach all runs to an existing OpenCode server URL)
- `BUI_RUNTIME_DIR` (optional, default `~/.config/opencode/bui`)
- `BUI_DB_PATH` (optional, default `opencode-bui.db` next to resolved `opencode-bui.config.*`; falls back to runtime dir)
- `BUI_UPLOAD_DIR` (optional)
- `BUI_LOCK_PATH` (optional)
- `TELEGRAM_BACKLOG_STALE_SECONDS` (optional, default `45`)
- `TELEGRAM_BACKLOG_BATCH_WINDOW_MS` (optional, default `1200`)
- `TELEGRAM_STT_COMMAND` (optional)
- `TELEGRAM_STT_TIMEOUT_MS` (optional, default `120000`)

The runtime database is `~/.config/opencode/bui/opencode-bui.db` by default.
If a `opencode-bui.config.*` file is discovered in a `bui/` directory, `opencode-bui.db` is created next to that config by default.
