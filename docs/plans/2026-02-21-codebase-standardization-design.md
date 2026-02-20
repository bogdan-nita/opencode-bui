# Codebase Standardization Design

## Overview

Restructure OpenCode BUI for cleaner architecture with Core + Infra separation, standardized conventions, and improved organization.

## Goals

1. Clean, intuitive module structure
2. Consistent file sharding pattern
3. Standardized naming conventions
4. No deprecated artifacts
5. Up-to-date documentation

## Structure

### New Architecture: Core + Infra

```
src/
├── main.ts              # Composition root
├── cli/                 # CLI entrypoints
│   └── onboard/
├── core/                # Runtime orchestrator (was runtime/)
│   ├── runtime/
│   │   ├── runtime.ts
│   │   ├── runtime.types.ts
│   │   └── runtime.test.ts
│   ├── handlers/
│   ├── state/
│   ├── services/
│   └── index.ts
├── agent/               # OpenCode client integration
│   ├── agent/
│   │   ├── agent.ts
│   │   └── agent.schema.ts
│   ├── client/
│   ├── commands/
│   └── index.ts
├── api/                 # Plugin-bridge API
│   ├── server/
│   │   ├── server.ts
│   │   ├── server.types.ts
│   │   └── server.schema.ts
│   ├── client/
│   │   ├── client.ts
│   │   └── client.types.ts
│   ├── discovery/
│   └── index.ts
├── bridge/              # Bridge system (was runtime/bridge/)
│   ├── adapters/
│   │   ├── telegram/
│   │   └── discord/
│   ├── registry/
│   ├── supervisor/
│   ├── types/
│   └── index.ts
├── database/            # Storage layer
│   ├── client/
│   │   ├── client.ts
│   │   ├── client.types.ts
│   │   └── client.consts.ts
│   ├── entities/
│   │   ├── session/
│   │   │   ├── session.schema.ts
│   │   │   └── session.store.ts
│   │   ├── permission/
│   │   │   ├── permission.schema.ts
│   │   │   └── permission.store.ts
│   │   ├── agent/
│   │   │   ├── agent.schema.ts
│   │   │   └── agent.store.ts
│   │   └── media/
│   │       └── media.store.ts
│   ├── types.ts
│   └── index.ts
└── infra/               # Infrastructure utilities
    ├── config/
    ├── logger/
    ├── fs/
    ├── lock/
    ├── process/
    ├── time/
    └── index.ts
```

### Import Path Changes

| Old | New |
|-----|-----|
| `@runtime` | `@core` |
| `@runtime/bridge` | `@bridge` |
| `@runtime/config` | `@infra/config` |
| `@runtime/logger` | `@infra/logger` |
| `@runtime/runtime-fs` | `@infra/fs` |
| `@runtime/runtime-process` | `@infra/process` |
| `@database` | `@database` (unchanged) |
| `@agent` | `@agent` (unchanged) |
| `@api` | `@api` (unchanged) |

## Conventions

### File Sharding Pattern

Each sharded module lives in its own folder:

```
foo/
├── foo.ts              # Main implementation
├── foo.types.ts        # Type definitions
├── foo.schema.ts       # Zod/validation schemas
├── foo.consts.ts       # Constants
├── foo.utils.ts        # Helper functions
└── foo.test.ts         # Tests (same folder)
```

### Naming Conventions

| Pattern | Example | Notes |
|---------|---------|-------|
| Acronyms | `ID`, `DB`, `API` | Uppercase, not mixed |
| Files | `foo-bar.ts` | kebab-case |
| Exports | `fooBar` | camelCase |
| Types | `FooBar` | PascalCase |
| Tables | `foo_bar` | snake_case |

### Module Boundaries

- `index.ts` only at top-level modules
- No nested barrel files
- Top-level modules: `core`, `agent`, `api`, `bridge`, `database`, `infra`

### Test Placement

- `foo.test.ts` lives next to `foo.ts`

## Cleanup Tasks

1. Delete `.opencode_deprecated/` folder
2. Update `README.md` with new structure
3. Update `docs/architecture/README.md`
4. Remove old PLAN.md / REQUIREMENTS.md references from AGENTS.md

## Lint Rules

Add to `.oxlintrc.json`:

```json
{
  "rules": {
    "no-default-export": "error",
    "no-anonymous-default-export": "warn"
  }
}
```

## Migration Steps

1. Create new folder structure
2. Move files to new locations
3. Update all imports
4. Update `tsconfig.json` paths
5. Run lint, test, build
6. Delete `.opencode_deprecated/`
7. Update documentation

## Validation

- `bun run lint` - 0 errors
- `bun run test` - all 110+ tests pass
- `bun run build` - succeeds
