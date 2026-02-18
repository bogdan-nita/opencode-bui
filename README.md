# OpenCode Telegram Bridge Plugin (local project)

This is an **OpenCode plugin** developed locally on your Desktop.

It starts a Telegram bot from inside OpenCode and forwards Telegram messages into OpenCode sessions.

## Behavior

- Each Telegram chat maps to one OpenCode session.
- Normal text messages are sent via `client.session.prompt`.
- Slash commands are sent via `client.session.command`.
- Local helper commands:
  - `/start`
  - `/session`
  - `/resetchat`

## Project location

- Source: `~/Desktop/opencode-telegram-bot`
- Built plugin file loaded by OpenCode: `~/.config/opencode/plugins/plugin.js`

## Setup

1. Update `.env` in this project
2. Build plugin output into OpenCode plugin directory

```bash
npm install
npm run build:plugin
```

3. Restart OpenCode

For live development:

```bash
npm run watch:plugin
```

## Environment variables

- `TELEGRAM_BOT_TOKEN` (required)
- `TELEGRAM_ALLOWED_USER_IDS` (optional, comma-separated numeric IDs)
- `TELEGRAM_SESSION_STORE` (optional path for chat->session mapping file)
- `TELEGRAM_PLUGIN_ENV` (optional explicit `.env` path)

By default, the plugin tries `.env` in:

1. `TELEGRAM_PLUGIN_ENV` (if set)
2. `~/.config/opencode/plugins/.env`
3. `~/Desktop/opencode-telegram-bot/.env`
4. current working directory
