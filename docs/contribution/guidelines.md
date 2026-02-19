# Contribution Guidelines

## Principles

- Keep bridge-specific behavior in `packages/opencode-bui-bridge/src/bridges/<name>/`.
- Keep orchestration in `packages/opencode-bui-bridge/src/core/application/`.
- Do not add bridge-type branching in core policy logic.
- Use Zod for unknown or external input parsing.

## Naming and structure

- Follow naming conventions: `*.schema.ts`, `*.types.ts`, `*.utils.ts`, `*.test.ts`.
- Prefer Bun runtime behavior and shared helpers in `packages/opencode-bui-bridge/src/infra/runtime/`.

## Validation before merge

Run all checks:

```bash
bun run lint
bun run test
bun run build
```

Run operational checks when bridge/config behavior changes:

```bash
bun run doctor
bun run bridge:test
```

## Docs updates are required when changing

- Bridge behavior or onboarding.
- Config schema or precedence.
- DB schema or migration workflow.
- Runtime operational commands.
