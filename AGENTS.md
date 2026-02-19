# AGENTS

## Mission

Maintain `opencode-bui` as a Bun-first, bridge-agnostic runtime where each bridge owns its own behavior contract.

## Always follow

- Keep abstraction boundaries:
  - bridge-specific logic in `src/bridges/<name>/`
  - orchestration in `src/core/application/`
  - no bridge-type branching in core policy logic
- Prefer Zod over ad-hoc unknown parsing.
- Keep naming style: `*.schema.ts`, `*.types.ts`, `*.utils.ts`, `*.test.ts`.
- Keep Bun-first runtime behavior.

## Required checks before finishing

```bash
bun run lint
bun run test
bun run build
```

## Required docs update triggers

Update docs in `docs/` when any of these change:

- bridge behavior or onboarding behavior
- config schema/precedence
- DB schema/migration workflow
- runtime operational commands
