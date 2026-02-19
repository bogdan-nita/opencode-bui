# Agent Workflow

This project is designed to be maintained with autonomous coding agents.

## Non-negotiable rules

- Keep bridge-specific behavior inside bridge definitions.
- Avoid bridge-type branching in core orchestration.
- Keep files in the project naming style: `*.schema.ts`, `*.types.ts`, `*.utils.ts`, `*.test.ts`.
- Use Zod for external and unknown input parsing.
- Prefer Bun runtime APIs and shared runtime helpers in `packages/opencode-bui-bridge/src/infra/runtime/`.

## Agent maintenance loop

1. Run `bun run doctor`.
2. Run `bun run bridge:test`.
3. Implement scoped changes.
4. Run `bun run lint && bun run test && bun run build`.
5. Update docs in `docs/` for behavior changes.

## Where to change what

- New bridge behavior: `packages/opencode-bui-bridge/src/bridges/<bridge>/`.
- Shared policy: `packages/opencode-bui-bridge/src/core/application/`.
- Config and validation: `packages/opencode-bui-bridge/src/infra/config/`.
- Storage: `packages/opencode-bui-bridge/src/infra/db/` and `packages/opencode-bui-bridge/src/infra/store/`.
