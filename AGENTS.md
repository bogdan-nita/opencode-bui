# AGENTS

- **Developer**: Implement features, fix bugs, build bridges
- **Reviewer**: Review PRs
- **Tester**: Write tests
- **Planner**: Track requirements, coordinate, TDD workflow

## Workflow

1. **Discuss** - User describes features
2. **Design** - Create design doc in `docs/plans/YYYY-MM-DD-<topic>-design.md`
3. **Plan** - Create implementation plan with bite-sized tasks
4. **Implement** - Execute plan with TDD
5. **Review** - Code review before merge

## Run

```bash
bun run dev  # Telegram control
bun run lint && bun run test && bun run build
```

## Architecture

See `docs/architecture/README.md` for current structure.
