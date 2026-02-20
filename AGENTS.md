# AGENTS

- **Developer**: Implement features, fix bugs, build bridges
- **Reviewer**: Review PRs
- **Tester**: Write tests
- **Planner**: Track requirements, coordinate, TDD workflow

## Workflow

1. **Discuss** - User describes features
2. **Distill** - Planner captures in REQUIREMENTS.md as `[ ]`
3. **Plan** - Create tasks in PLAN.md (TDD: test → implement → review)
4. **Coordinate** - Handoff between agents in sequence

## Run

```bash
bun run dev  # Telegram control
bun run lint && bun run test && bun run build
```

## Architecture

- Bridge-specific: `src/bridges/<name>/`
- Core: `src/core/application/`
- Infra: `src/infra/`

No bridge-type branching in core policy.
