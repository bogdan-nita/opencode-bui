# Handler Refactoring & Runtime Factories Design

## Overview

Refactor large handler files and extract runtime factories with proper module structure, following folder-per-module sharding pattern.

## Goals

1. Split `envelope.handler.ts` (436 lines) into focused utility modules
2. Split `inbound.handler.ts` (335 lines) into focused utility modules
3. Extract runtime factories with consistent structure
4. Add tests to improve coverage from 31% to 80%+

## Handler Refactoring

### Structure

```
core/handlers/
├── envelope/
│   ├── envelope.handler.ts      # Main orchestration only
│   ├── typing/
│   │   ├── typing.ts            # Start/stop typing indicator
│   │   ├── typing.test.ts
│   ├── activity/
│   │   ├── activity.ts          # Activity queue and flush logic
│   │   ├── activity.test.ts
│   ├── outbound/
│   │   ├── outbound.ts          # Send outbound messages, filter attachments
│   │   ├── outbound.test.ts
│   ├── screenshot/
│   │   ├── screenshot.ts        # Screenshot capture pipeline
│   │   ├── screenshot.test.ts
│   └── permission-ui/
│       ├── permission-ui.ts     # Permission request UI
│       ├── permission-ui.test.ts
├── inbound/
│   ├── inbound.handler.ts       # Main orchestration
│   └── ...
├── permission.handler.ts        # Keep as-is (small enough)
└── backlog.handler.ts           # Keep as-is (small enough)
```

### Naming Conventions

- Folder: `kebab-case` (e.g., `typing/`, `activity/`)
- Main file: matches folder name (e.g., `typing/typing.ts`)
- Test file: `.test.ts` suffix (e.g., `typing/typing.test.ts`)
- Barrel: `index.ts`

## Runtime Factories

### Structure

```
core/runtime/
│   ├── runtime.ts               # Orchestration only
│   ├── runtime.types.ts
│   ├── runtime.test.ts
├── utils/
│   ├── create-stores/
│   │   ├── create-stores.ts     # Create all DB stores
│   │   ├── create-stores.test.ts
│   ├── create-clock/
│   │   ├── create-clock.ts     # Create clock instance
│   │   ├── create-clock.test.ts
│   ├── create-agent/
│   │   ├── create-agent.ts     # Create OpenCode client
│   │   ├── create-agent.test.ts
│   └── create-state/
│       ├── create-state.ts
│       ├── create-state.test.ts
└── index.ts
```

## Import Changes

### Handler imports

```typescript
// Old (in envelope.handler.ts)
import { Effect } from "effect";
import { stat } from "node:fs/promises";
// ... lots of imports

// New
import { startTypingIndicator, stopTypingIndicator } from "./typing/typing";
import { createActivityTracker, flushActivity } from "./activity/activity";
import { sendOutboundMessages } from "./outbound/outbound";
import { captureAndAnalyzeScreenshot } from "./screenshot/screenshot";
```

### Runtime imports

```typescript
// Old
const sessionStore = createLibsqlSessionStore(database);
const agentStore = createLibsqlAgentStore(database);
const mediaStore = createFileMediaStore(input.config.paths.uploadDir);
const permissionStore = createLibsqlPermissionStore(database);

// New
const { sessionStore, agentStore, mediaStore, permissionStore } = createStores(
  database,
  input.config.paths,
);
```

## Test Coverage Goals

| Module                | Current | Target |
| --------------------- | ------- | ------ |
| `envelope.handler.ts` | 13%     | 80%    |
| `inbound.handler.ts`  | 5%      | 80%    |
| `runtime.ts`          | 52%     | 80%    |
| Overall               | 31%     | 80%    |

## Migration Steps

1. Create folder structure for each handler
2. Extract utility functions to new modules
3. Update imports in main handler files
4. Add tests for each extracted module
5. Run lint, test, build
6. Commit

## Validation

- `bun run lint` - 0 errors
- `bun run test` - all tests pass
- `bun run build` - succeeds
- Coverage: 80%+
