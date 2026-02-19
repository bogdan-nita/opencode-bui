# Bridges

## Bridge ownership model

Each bridge owns:

- Config validation (`assertConfigured`).
- Healthcheck endpoint logic (`healthcheck`).
- Runtime behavior policy (`runtimePolicy`).
- Onboarding config and env snippets (`onboarding`).
- SDK adapter creation (`createAdapter`).

Core owns only orchestration and shared policy execution.

At runtime, bridges receive command descriptors composed from:

- native BUI commands
- OpenCode command markdown files discovered from config context

This keeps bridge command menus aligned with current OpenCode command sets.

## Current bridges

- Telegram: `packages/opencode-bui-bridge/src/bridges/telegram/telegram.definition.ts`, `packages/opencode-bui-bridge/src/bridges/telegram/telegram.bridge.ts`
- Discord: `packages/opencode-bui-bridge/src/bridges/discord/discord.definition.ts`, `packages/opencode-bui-bridge/src/bridges/discord/discord.bridge.ts`
- Plugin bridge endpoint: `packages/opencode-bui-bridge/src/core/application/bui-runtime.utils.ts` (oRPC `/rpc`, session->conversation forwarding)

## Adding a new bridge

1. Create `packages/opencode-bui-bridge/src/bridges/<bridge>/<bridge>.definition.ts`.
2. Create `packages/opencode-bui-bridge/src/bridges/<bridge>/<bridge>.bridge.ts` adapter.
3. Register definition in `packages/opencode-bui-bridge/src/core/application/bridge-registry.utils.ts`.
4. Add config schema entries in `packages/opencode-bui-bridge/src/infra/config/config.schema.ts`.
5. Add tests (definition + adapter contract + runtime smoke).
