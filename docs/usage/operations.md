# Operations

## Common commands

- Start enabled bridges: `bun run start`
- Start with watch: `bun run dev`
- Telegram-only watch entry: `bun run dev:telegram`
- Diagnostics: `bun run doctor`
- Bridge connectivity checks: `bun run bridge:test`
- Test one bridge: `bun run bridge:test --bridge telegram --timeout 5000`

In-chat runtime controls:

- `/interrupt` (or `/interupt`) cancels the active OpenCode run for that conversation.
- `/context` shows active run/session/workspace details, attach mode, and pending permission count.
- While a run is active, BUI streams OpenCode activity updates live to the bridge.
- Activity updates are rendered as quoted lines (`> step started`, `> tool (running)`, `> step finished (...)`) and updated in-place when bridge message editing is available.
- Permission prompts from OpenCode are routed to bridge buttons (`Allow Once`, `Always Allow`, `Reject`).
- Permission decisions are conversation-bound and requester-bound.
- Permission state is persisted so first valid click resolves the request and repeated clicks are safely treated as already handled.
- Inbound media messages are downloaded, stored under runtime uploads, and analyzed through OpenCode.

## Session idle timeout

- `BUI_SESSION_IDLE_TIMEOUT_SECONDS` controls how long conversation-to-session mapping is kept without activity.
- Default is `900` seconds.
- On timeout, mapping is cleared; the next message starts a fresh mapped session.

## OpenCode startup behavior

- `BUI_OPENCODE_EAGER_START=1` (default) pre-warms OpenCode SDK context during BUI startup.
- This shifts startup cost to boot time and reduces first-message latency in chat.

## Typing indicator

- `BUI_TYPING_INDICATOR=1` (default) emits bridge typing indicators while a run is active.
- Set `BUI_TYPING_INDICATOR=0` to disable typing actions.

Bridge command registration includes native BUI commands plus command markdown files discovered from current OpenCode config directories (`commands/` or `.opencode/commands/`).

## Quality gates

- Lint: `bun run lint`
- Tests: `bun run test`
- Bundle build: `bun run build`

## DB operations

- Generate migration: `bun run db:generate`
- Apply migration: `bun run db:migrate`

## Onboarding

- Interactive setup: `bun run onboard`
- Onboarding now starts runtime automatically after config/env validation.
- Onboarding writes config into the closest OpenCode context (`.opencode/bui` when `.opencode` exists, otherwise the OpenCode root directory).
- `.env` creation is optional during onboarding.

## Logs

- Runtime logs use `pino` and are pretty-printed by default in interactive terminals.
- Disable pretty output with `BUI_PRETTY_LOGS=0`.
- Logs are also written to file by default (`./opencode-bui.log`).
- Override path with `BUI_LOG_FILE=/absolute/path/opencode-bui.log`.
- Disable file logging with `BUI_LOG_TO_FILE=0`.

## Hybrid attach mode

- Set `OPENCODE_ATTACH_URL` to route all BUI-run sessions through a running OpenCode server.
- This enables a hybrid mode where BUI uses OpenCode server-side context/plugins while keeping bridge orchestration in BUI.
- Default is off; when `OPENCODE_ATTACH_URL` is unset, BUI starts an embedded OpenCode SDK server for local runs.

## Plugin + bridge mode

- Enable bridge endpoint with `BUI_PLUGIN_BRIDGE_SERVER=1`.
- Default endpoint: `http://127.0.0.1:4499/v1/plugin/send`.
- Secret gating: bridge requires `x-bui-token` (from `BUI_PLUGIN_BRIDGE_TOKEN` or generated token).
- Autodiscovery: bridge writes discovery file at `<runtimeDir>/plugin-bridge.discovery.json` (override with `BUI_PLUGIN_BRIDGE_DISCOVERY`).
- OpenCode plugin tools:
  - `bui_bridge_boot` starts bridge if missing.
  - `bui_send` sends text/files from current OpenCode session to bridge chat.
- OpenCode plugin file example (`~/.config/opencode/plugins/opencode-bui-plugin.js`):
  - `import { OpenCodeBuiPlugin } from "opencode-bui"`
  - `export const BuiBridgePlugin = OpenCodeBuiPlugin`

Session visibility note:

- If BUI runs with embedded OpenCode (`OPENCODE_ATTACH_URL` unset), sessions may not appear in the TUI instance you are using.
- Use `OPENCODE_ATTACH_URL` to point BUI at the same OpenCode server used by TUI when you want shared `/sessions` visibility.

## Attachment safety limits

- `BUI_MAX_ATTACHMENTS_PER_MESSAGE` (default `6`) limits outbound attachment count per message.
- `BUI_MAX_ATTACHMENT_BYTES` (default `10485760`) skips outbound attachments larger than the limit.
- With `BUI_AGENT_BRIDGE_TOOLS=1` (default), agent can request explicit attachment send by emitting lines in output:
  - `@bui.attach /absolute/or/relative/path | optional caption`
- When files are skipped, BUI posts a reason in chat.

## Screenshot support

Supported per OS:

- macOS: `screencapture`
- Linux: `grim` or `gnome-screenshot` or `import`
- Windows: PowerShell `CopyFromScreen`
