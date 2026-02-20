# Requirements

## Dev Workflow

1. Planner tracks requirements in REQUIREMENTS.md as `[ ]`
2. Refine to PLAN.md with TDD sequence
3. Developer implements → `bun run lint && bun run test && bun run build`
4. Tester reviews tests
5. Reviewer reviews code

## Conventions

- Sharding: `foo.ts`, `foo.schema.ts`, `foo.types.ts`, `foo.consts.ts`, `foo.utils.ts`, `foo.test.ts`
- Naming: `ID` not `Id`, `DB` not `Db`
- index.ts at module boundaries only
- Bridges: `src/bridges/<name>/`, Core: `src/core/application/`
