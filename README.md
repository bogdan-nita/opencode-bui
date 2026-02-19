# OpenCode BUI

OpenCode BUI (Bot User Interface) is a Bun-first standalone runtime that exposes OpenCode sessions through bridge adapters.

It currently supports Telegram and Discord bridges (enabled per config).

## Highlights

- Bridge-agnostic core runtime (`packages/opencode-bui-bridge/src/core/application`) with bridge-owned behavior contracts.
- One Telegram chat maps to one OpenCode session for predictable conversational context.
- Slash parity: unknown slash commands are forwarded to OpenCode (`/help`, `/init`, `/undo`, `/redo`, and more).
- BUI-native operations: `/new`, `/cd`, `/cwd`, `/session`, `/screenshot`, `/reload`, `/pid`, `/health`, `/agent ...`.
- Runtime visibility command: `/context` for active run, session/workspace, attach mode, and pending permissions.
- Local-first runtime with LibSQL + Drizzle storage and configurable runtime directories.
- Offline backlog handling and media forwarding support.

## Getting Started

### Prerequisites

- Bun `>= 1.3.9` (`.bun-version` is included).
- OpenCode CLI available on your machine (`opencode` in `PATH`, or set `OPENCODE_BIN`).
- A bot token for your enabled bridge(s).

### Installation

```bash
bun install
```

### Quick Start

1. Configure environment (recommended location: `~/.config/opencode/bui/.env`).
2. Run onboarding:

```bash
bun run onboard
```

3. Start runtime:

```bash
bun run start
```

Alternative (bunx-style CLI):

```bash
bunx opencode-bui-bridge onboard
bunx opencode-bui-bridge start
```

Bridge CLI:

```bash
bun run start
```

OpenCode plugin registration (global example):

```js
// ~/.config/opencode/plugins/opencode-bui-plugin.js
import { OpenCodeBuiPlugin } from "opencode-bui-plugin"

export const BuiBridgePlugin = OpenCodeBuiPlugin
```

Useful plugin tools from OpenCode sessions:

- Bridge auto-boot is attempted when OpenCode loads the plugin.
- `bui_send` sends text/files from the active session to configured bridge chat.

Optional local binary link:

```bash
bun link
```

Then use:

```bash
opencode-bui-bridge start
```

## Configuration

Configuration precedence:

1. nearest working directory config (`opencode-bui.config.*`)
2. nearest OpenCode config directory (`opencode.json`) and its `bui/` folder
3. global `~/.config/opencode/bui`
4. environment variables (highest precedence)

Example `opencode-bui.config.ts`:

```ts
export default {
  runtimeDir: "~/.config/opencode/bui",
  dbPath: "~/.config/opencode/bui/opencode-bui.db",
  opencodeBin: "opencode",
  opencodeAttachUrl: process.env.OPENCODE_ATTACH_URL || undefined,
  sessionIdleTimeoutSeconds: 900,
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

Common environment variables:

- `TELEGRAM_BOT_TOKEN` (required when `bridges.telegram.enabled=true`)
- `TELEGRAM_ALLOWED_USERS` (optional, comma-separated usernames and/or numeric IDs)
- `DISCORD_BOT_TOKEN` (required when `bridges.discord.enabled=true`)
- `DISCORD_APPLICATION_ID` (optional)
- `OPENCODE_BIN` (optional, default `opencode`)
- `OPENCODE_ATTACH_URL` (optional)
- `BUI_SESSION_IDLE_TIMEOUT_SECONDS` (optional, default `900`)
- `BUI_RUNTIME_DIR` (optional, default `~/.config/opencode/bui`)
- `BUI_DB_PATH` (optional)
- `BUI_MAX_ATTACHMENTS_PER_MESSAGE` (optional, default `6`)
- `BUI_MAX_ATTACHMENT_BYTES` (optional, default `10485760`)
- `BUI_AGENT_BRIDGE_TOOLS` (optional, default `1`; injects bridge tool instructions so agent can request explicit attachments)
- `BUI_OPENCODE_EAGER_START` (optional, default `1`; pre-warms OpenCode SDK context at runtime startup)
- `BUI_TYPING_INDICATOR` (optional, default `1`; sends typing indicator while runs are active)
- `BUI_PLUGIN_BRIDGE_SERVER` (optional, default `0`; enables plugin->bridge HTTP endpoint)
- `BUI_PLUGIN_BRIDGE_HOST` (optional, default `127.0.0.1`)
- `BUI_PLUGIN_BRIDGE_PORT` (optional, default `4499`)
- `BUI_PLUGIN_BRIDGE_TOKEN` (optional, recommended for local auth)
- `BUI_PLUGIN_BRIDGE_URL` (optional, plugin helper endpoint URL)
- `BUI_PLUGIN_BRIDGE_DISCOVERY` (optional, default `<runtimeDir>/plugin-bridge.discovery.json`)
- `BUI_BRIDGE_BOOT_COMMAND` (optional, override auto-boot command)
- `BUI_DEV_HOT_RELOAD` (optional, set `1` to auto-boot bridge with Bun watch mode)
- `BUI_PLUGIN_HOT_RELOAD` (optional, set `1` to reload plugin runtime module on each tool call)
- `BUI_LOG_TO_FILE` (optional, default `1`)
- `BUI_LOG_FILE` (optional, default `./opencode-bui.log`)

## Development

Run in watch mode:

```bash
bun run dev
```

Standalone Telegram bridge dev entry:

```bash
bun run dev:telegram
```

Diagnostics:

```bash
bun run doctor
bun run bridge:test
```

Database migrations:

```bash
bun run db:generate
bun run db:migrate
```

## Quality Gates

```bash
bun run lint
bun run test
bun run build
```

## Project Structure

- `packages/opencode-bui-bridge/src/bin/*`: bridge CLI and onboarding
- `packages/opencode-bui-bridge/src/core/*`: runtime domain, ports, and orchestration
- `packages/opencode-bui-bridge/src/infra/*`: config, storage, db, lock, OpenCode adapter and plugin bridge API
- `packages/opencode-bui-bridge/src/bridges/*`: Telegram/Discord bridge adapters
- `packages/opencode-bui-plugin/src/plugin/*`: OpenCode plugin module exports and tool definitions
- `docs/*`: architecture, usage, and contribution guides

Naming conventions:

- `*.schema.ts`
- `*.types.ts`
- `*.utils.ts`
- `*.test.ts`

## Documentation

- `docs/README.md`
- `docs/architecture/README.md`
- `docs/usage/README.md`
- `docs/contribution/README.md`

## Contributing

Contributions are welcome. Please read:

- `AGENTS.md` for engineering constraints and architecture boundaries
- `docs/contribution/guidelines.md`
- `docs/contribution/agent-workflow.md`

Open an issue for bugs or feature proposals before larger changes.

## License

This project is licensed under the MIT License. See `LICENSE`.
