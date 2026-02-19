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

- Telegram: `src/bridges/telegram/telegram.definition.ts`, `src/bridges/telegram/telegram.bridge.ts`
- Discord: `src/bridges/discord/discord.definition.ts`, `src/bridges/discord/discord.bridge.ts`

## Adding a new bridge

1. Create `src/bridges/<bridge>/<bridge>.definition.ts`.
2. Create `src/bridges/<bridge>/<bridge>.bridge.ts` adapter.
3. Register definition in `src/core/application/bridge-registry.utils.ts`.
4. Add config schema entries in `src/infra/config/config.schema.ts`.
5. Add tests (definition + adapter contract + runtime smoke).
