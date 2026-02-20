# Codebase Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure OpenCode BUI with Core + Infra architecture, standardized conventions, and clean module boundaries.

**Architecture:** Split src/ into 6 top-level domains (core, agent, api, bridge, database, infra). Each domain has folder-per-module sharding with index.ts only at top level. No nested barrels.

**Tech Stack:** Bun, TypeScript, Vitest, oxlint, Drizzle ORM, LibSQL

---

## Phase 1: Cleanup

### Task 1: Delete deprecated folder

**Files:**
- Delete: `.opencode_deprecated/`

**Step 1: Remove the deprecated folder**

```bash
rm -rf .opencode_deprecated/
```

**Step 2: Verify deletion**

Run: `ls -la | grep opencode`
Expected: No output (folder deleted)

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated .opencode_deprecated folder"
```

---

### Task 2: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Step 1: Remove old references**

Edit `AGENTS.md` to remove any references to PLAN.md and REQUIREMENTS.md workflow:

```markdown
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
```

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md workflow"
```

---

## Phase 2: Create New Structure

### Task 3: Create folder structure

**Files:**
- Create directories for new structure

**Step 1: Create new top-level directories**

```bash
mkdir -p src/core/runtime
mkdir -p src/bridge/adapters/telegram
mkdir -p src/bridge/adapters/discord
mkdir -p src/bridge/registry
mkdir -p src/bridge/supervisor
mkdir -p src/bridge/types
mkdir -p src/bridge/utils
mkdir -p src/bridge/health-service
mkdir -p src/bridge/bridge-test
mkdir -p src/bridge/media-coordinator
mkdir -p src/bridge/bridge-definition
mkdir -p src/infra/config
mkdir -p src/infra/logger
mkdir -p src/infra/fs
mkdir -p src/infra/lock
mkdir -p src/infra/process
mkdir -p src/infra/time
mkdir -p src/database/client
mkdir -p src/database/entities/session
mkdir -p src/database/entities/permission
mkdir -p src/database/entities/agent
mkdir -p src/database/entities/media
```

**Step 2: Verify structure created**

Run: `ls -la src/`
Expected: `agent api bridge cli core database infra main.ts runtime`

---

### Task 4: Move runtime to core

**Files:**
- Move: `src/runtime/*` → `src/core/`
- Move: `src/runtime/bridge/*` → `src/bridge/`
- Move: `src/runtime/config/*` → `src/infra/config/`
- Move: `src/runtime/logger/*` → `src/infra/logger/`
- Move: `src/runtime/runtime-fs/*` → `src/infra/fs/`
- Move: `src/runtime/runtime-process/*` → `src/infra/process/`
- Move: `src/runtime/lock/*` → `src/infra/lock/`
- Move: `src/runtime/time/*` → `src/infra/time/`

**Step 1: Move core runtime files**

```bash
mv src/runtime/runtime.ts src/core/runtime/
mv src/runtime/runtime.types.ts src/core/runtime/
mv src/runtime/runtime.test.ts src/core/runtime/
mv src/runtime/index.ts src/core/
```

**Step 2: Move handlers to core**

```bash
mv src/runtime/handlers src/core/
```

**Step 3: Move state to core**

```bash
mv src/runtime/state src/core/
```

**Step 4: Move services to core**

```bash
mv src/runtime/services src/core/
```

**Step 5: Move middleware to core**

```bash
mv src/runtime/middleware src/core/
```

**Step 6: Move conversation-router to core**

```bash
mv src/runtime/conversation-router src/core/
```

**Step 7: Move command-router to core**

```bash
mv src/runtime/command-router src/core/
```

**Step 8: Move backlog-coordinator to core**

```bash
mv src/runtime/backlog-coordinator src/core/
```

---

### Task 5: Move bridge module

**Files:**
- Move: `src/runtime/bridge/*` → `src/bridge/`

**Step 1: Move bridge adapters**

```bash
mv src/runtime/bridge/adapters/* src/bridge/adapters/
```

**Step 2: Move bridge registry**

```bash
mv src/runtime/bridge/registry/* src/bridge/registry/
```

**Step 3: Move bridge supervisor**

```bash
mv src/runtime/bridge/supervisor/* src/bridge/supervisor/
```

**Step 4: Move bridge types**

```bash
mv src/runtime/bridge/types/* src/bridge/types/
```

**Step 5: Move bridge utils**

```bash
mv src/runtime/bridge/utils/* src/bridge/utils/
```

**Step 6: Move bridge health-service**

```bash
mv src/runtime/bridge/health-service/* src/bridge/health-service/
```

**Step 7: Move bridge-test**

```bash
mv src/runtime/bridge/bridge-test/* src/bridge/bridge-test/
```

**Step 8: Move media-coordinator**

```bash
mv src/runtime/bridge/media-coordinator/* src/bridge/media-coordinator/
```

**Step 9: Move bridge-definition**

```bash
mv src/runtime/bridge/bridge-definition/* src/bridge/bridge-definition/
```

**Step 10: Move bridge root files**

```bash
mv src/runtime/bridge/index.ts src/bridge/
mv src/runtime/bridge/bridge.test.ts src/bridge/
```

---

### Task 6: Move infra modules

**Files:**
- Move: `src/runtime/config/*` → `src/infra/config/`
- Move: `src/runtime/logger/*` → `src/infra/logger/`
- Move: `src/runtime/runtime-fs/*` → `src/infra/fs/`
- Move: `src/runtime/runtime-process/*` → `src/infra/process/`
- Move: `src/runtime/lock/*` → `src/infra/lock/`
- Move: `src/runtime/time/*` → `src/infra/time/`

**Step 1: Move config**

```bash
mv src/runtime/config/* src/infra/config/
```

**Step 2: Move logger**

```bash
mv src/runtime/logger/* src/infra/logger/
```

**Step 3: Move runtime-fs to fs**

```bash
mv src/runtime/runtime-fs/* src/infra/fs/
```

**Step 4: Move runtime-process to process**

```bash
mv src/runtime/runtime-process/* src/infra/process/
```

**Step 5: Move lock**

```bash
mv src/runtime/lock/* src/infra/lock/
```

**Step 6: Move time**

```bash
mv src/runtime/time/* src/infra/time/
```

**Step 7: Create infra index.ts**

Create `src/infra/index.ts`:

```typescript
export * from "./config";
export * from "./logger";
export * from "./fs";
export * from "./process";
export * from "./lock";
export * from "./time";
```

---

### Task 7: Restructure database

**Files:**
- Move: `src/database/db.ts` → `src/database/client/client.ts`
- Move: `src/database/types.ts` → `src/database/client/client.types.ts`
- Move: `src/database/consts.ts` → `src/database/client/client.consts.ts`
- Split: `src/database/schema.ts` → `src/database/entities/*/`

**Step 1: Create client folder structure**

```bash
mkdir -p src/database/client
```

**Step 2: Move db.ts to client.ts**

```bash
mv src/database/db.ts src/database/client/client.ts
mv src/database/types.ts src/database/client/client.types.ts
mv src/database/consts.ts src/database/client/client.consts.ts
```

**Step 3: Create entities structure**

```bash
mkdir -p src/database/entities/session
mkdir -p src/database/entities/permission
mkdir -p src/database/entities/agent
mkdir -p src/database/entities/media
```

**Step 4: Split schema.ts - create session.schema.ts**

Create `src/database/entities/session/session.schema.ts`:

```typescript
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversationSessionsTable = sqliteTable("conversation_sessions", {
  conversationKey: text("conversation_key").primaryKey(),
  bridgeId: text("bridge_id").notNull(),
  channelId: text("channel_id").notNull(),
  threadId: text("thread_id"),
  sessionId: text("session_id").notNull(),
  cwd: text("cwd"),
  updatedAt: text("updated_at").notNull(),
});

export const sessionWorkdirsTable = sqliteTable("session_workdirs", {
  sessionId: text("session_id").primaryKey(),
  cwd: text("cwd").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

**Step 5: Split schema.ts - create permission.schema.ts**

Create `src/database/entities/permission/permission.schema.ts`:

```typescript
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const permissionRequestsTable = sqliteTable("permission_requests", {
  permissionId: text("permission_id").primaryKey(),
  conversationKey: text("conversation_key").notNull(),
  requesterUserId: text("requester_user_id").notNull(),
  status: text("status").notNull(),
  response: text("response"),
  expiresAtUnixSeconds: text("expires_at_unix_seconds").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

**Step 6: Split schema.ts - create agent.schema.ts**

Create `src/database/entities/agent/agent.schema.ts`:

```typescript
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agentTemplatesTable = sqliteTable("agent_templates", {
  name: text("name").primaryKey(),
  template: text("template").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

**Step 7: Move stores to entities**

```bash
mv src/database/session-store.ts src/database/entities/session/session.store.ts
mv src/database/permission-store.ts src/database/entities/permission/permission.store.ts
mv src/database/agent-store.ts src/database/entities/agent/agent.store.ts
mv src/database/media-store.ts src/database/entities/media/media.store.ts
```

**Step 8: Delete old schema.ts**

```bash
rm src/database/schema.ts
```

**Step 9: Update database index.ts**

Edit `src/database/index.ts`:

```typescript
export { createRuntimeDB } from "./client/client";
export type { RuntimeDB, RuntimeDBFactoryOptions } from "./client/client.types";

export { createLibsqlSessionStore } from "./entities/session/session.store";
export { createLibsqlPermissionStore } from "./entities/permission/permission.store";
export { createLibsqlAgentStore } from "./entities/agent/agent.store";
export { createFileMediaStore } from "./entities/media/media.store";

export { conversationSessionsTable, sessionWorkdirsTable } from "./entities/session/session.schema";
export { permissionRequestsTable } from "./entities/permission/permission.schema";
export { agentTemplatesTable } from "./entities/agent/agent.schema";
```

**Step 10: Move db.test.ts**

```bash
mv src/database/db.test.ts src/database/client/client.test.ts
```

---

### Task 8: Restructure agent module

**Files:**
- Restructure: `src/agent/` with folder-per-module sharding

**Step 1: Create agent folder**

```bash
mkdir -p src/agent/agent
```

**Step 2: Move agent files**

```bash
mv src/agent/agent.ts src/agent/agent/
mv src/agent/agent.schema.ts src/agent/agent/
```

**Step 3: Create agent index.ts**

Create `src/agent/agent/index.ts`:

```typescript
export { createOpenCodeClient } from "./agent";
export type { OpenCodeClient, OpenCodeRunOptions, OpenCodeResult } from "./agent";
```

---

### Task 9: Restructure api module

**Files:**
- Restructure: `src/api/` with folder-per-module sharding

**Step 1: Create server folder**

```bash
mkdir -p src/api/server
```

**Step 2: Move server files**

```bash
mv src/api/server.ts src/api/server/
mv src/api/server.types.ts src/api/server/
mv src/api/server.schema.ts src/api/server/
mv src/api/server.test.ts src/api/server/
```

**Step 3: Create client folder**

```bash
mkdir -p src/api/client
```

**Step 4: Move client files**

```bash
mv src/api/client.ts src/api/client/
mv src/api/client.types.ts src/api/client/
mv src/api/client.test.ts src/api/client/
```

**Step 5: Create server index.ts**

Create `src/api/server/index.ts`:

```typescript
export { startPluginBridgeServer } from "./server";
export type { PluginBridgeServer } from "./server.types";
```

**Step 6: Create client index.ts**

Create `src/api/client/index.ts`:

```typescript
export { createPluginBridgeClient } from "./client";
export type { PluginBridgeClient } from "./client.types";
```

---

## Phase 3: Update Imports

### Task 10: Update tsconfig.json paths

**Files:**
- Modify: `tsconfig.json`

**Step 1: Update path aliases**

Edit `tsconfig.json` to update compilerOptions.paths:

```json
{
  "compilerOptions": {
    "paths": {
      "@core": ["./src/core"],
      "@core/*": ["./src/core/*"],
      "@agent": ["./src/agent"],
      "@agent/*": ["./src/agent/*"],
      "@api": ["./src/api"],
      "@api/*": ["./src/api/*"],
      "@bridge": ["./src/bridge"],
      "@bridge/*": ["./src/bridge/*"],
      "@database": ["./src/database"],
      "@database/*": ["./src/database/*"],
      "@infra": ["./src/infra"],
      "@infra/*": ["./src/infra/*"]
    }
  }
}
```

**Step 2: Verify tsconfig is valid**

Run: `bun run build`
Expected: Build may fail due to import changes (expected at this stage)

---

### Task 11: Update all imports - core module

**Files:**
- Modify all files in `src/core/`

**Step 1: Update imports in core/runtime/runtime.ts**

Replace old imports with new:

```typescript
import { createOpenCodeClient } from "@agent/client";
import { discoverOpencodeCommands, mergeBridgeCommands } from "@agent/commands";
import { createSystemClock } from "@infra/time";
import { logger } from "@infra/logger";
import {
  createRuntimeDB,
  createFileMediaStore,
  createLibsqlAgentStore,
  createLibsqlPermissionStore,
  createLibsqlSessionStore,
} from "@database";
import { startAllBridges, stopAllBridges, waitForShutdownSignal } from "@bridge/supervisor";
import type { RuntimeDependencies } from "./runtime.types";
import { nativeCommands } from "./commands.consts";
import { createRuntimeState } from "../state/runtime-state";
import { createInboundHandler } from "../handlers/inbound.handler";
import { startPluginBridgeServer } from "../handlers/plugin-bridge.handler";
```

---

### Task 12: Update all imports - bridge module

**Files:**
- Modify all files in `src/bridge/`

**Step 1: Update imports in bridge/adapters**

Update all adapter imports from `@runtime/bridge/*` to `@bridge/*`

**Step 2: Update imports in bridge/registry**

Update registry imports from `@runtime/bridge/*` to `@bridge/*`

**Step 3: Update imports in bridge/supervisor**

Update supervisor imports from `@runtime/bridge/*` to `@bridge/*`

---

### Task 13: Update all imports - database module

**Files:**
- Modify all files in `src/database/`

**Step 1: Update client.ts imports**

Edit `src/database/client/client.ts`:

```typescript
import { fileExists } from "@infra/fs";
import { REQUIRED_TABLE_STATEMENTS } from "./client.consts";
import type { RuntimeDB, RuntimeDBFactoryOptions } from "./client.types";
```

**Step 2: Update store imports**

Update all `*-store.ts` files to import schemas from correct paths:

```typescript
import { conversationSessionsTable, sessionWorkdirsTable } from "./session.schema";
```

---

### Task 14: Update all imports - main.ts

**Files:**
- Modify: `src/main.ts`

**Step 1: Update main.ts imports**

Edit `src/main.ts`:

```typescript
import { discoverConfigContext, readRuntimeConfig, enabledBridges, type BridgeName } from "@infra/config";
import { bridgeDefinitionById, createBridgesForConfig } from "@bridge/registry";
import { startRuntime } from "@core";
import { createRuntimeDB } from "@database";
import { createPluginBridgeClient } from "@api/client";
import { createOpenCodeClient } from "@agent";
import { ensureDir, fileExists } from "@infra/fs";
import { logger } from "@infra/logger";
```

---

### Task 15: Update all imports - CLI

**Files:**
- Modify all files in `src/cli/`

**Step 1: Update CLI imports**

Replace `@runtime` with `@core` and `@infra` as appropriate.

---

### Task 16: Run lint to find remaining issues

**Step 1: Run linter**

Run: `bun run lint`
Expected: List of files with import errors

**Step 2: Fix each remaining import**

Go through each error and update imports.

---

## Phase 4: Validation

### Task 17: Run full test suite

**Step 1: Run tests**

Run: `bun run test`
Expected: All tests pass

**Step 2: If tests fail, debug and fix**

Check import paths and fix any remaining issues.

---

### Task 18: Run build

**Step 1: Run build**

Run: `bun run build`
Expected: Build succeeds

**Step 2: If build fails, fix issues**

Check for any remaining import or type errors.

---

### Task 19: Run lint

**Step 1: Run linter**

Run: `bun run lint`
Expected: 0 warnings, 0 errors

---

### Task 20: Final commit

**Step 1: Stage all changes**

```bash
git add -A
```

**Step 2: Commit**

```bash
git commit -m "refactor: restructure to core + infra architecture

- Move runtime/ to core/
- Extract bridge/ as top-level module
- Extract infra/ for config, logger, fs, lock, process, time
- Restructure database/ with client/ and entities/
- Apply folder-per-module sharding pattern
- Update all import paths"
```

---

## Phase 5: Documentation

### Task 21: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Update project structure section**

```markdown
## Project Structure

\`\`\`
src/
├── main.ts              # Composition root
├── cli/                 # CLI entrypoints
│   └── onboard/        # First-time setup
├── core/                # Runtime orchestrator
│   ├── runtime/        # Main runtime logic
│   ├── handlers/       # Request handlers
│   ├── state/          # Runtime state
│   ├── services/       # Shared services
│   └── middleware/     # Request middleware
├── agent/               # OpenCode client integration
│   ├── agent/          # Agent implementation
│   ├── client/         # OpenCode client
│   └── commands/       # Command discovery
├── api/                 # Plugin-bridge API
│   ├── server/         # API server
│   ├── client/         # API client
│   └── discovery/      # Service discovery
├── bridge/              # Bridge system
│   ├── adapters/       # Telegram, Discord
│   ├── registry/       # Bridge registry
│   ├── supervisor/     # Lifecycle management
│   └── types/          # Bridge types
├── database/            # Storage layer
│   ├── client/         # DB connection
│   └── entities/       # Session, Permission, Agent, Media
└── infra/               # Infrastructure
    ├── config/         # Config loading
    ├── logger/         # Logging
    ├── fs/             # File system
    ├── lock/           # Locking primitives
    ├── process/        # Process utilities
    └── time/           # Clock, time utilities
\`\`\`
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with new architecture"
```

---

### Task 22: Update architecture docs

**Files:**
- Modify: `docs/architecture/README.md`

**Step 1: Update architecture documentation**

Reflect new Core + Infra architecture.

**Step 2: Commit**

```bash
git add docs/architecture/
git commit -m "docs: update architecture documentation"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | Cleanup: remove deprecated, update AGENTS.md |
| 2 | 3-9 | Create structure: move files to new locations |
| 3 | 10-16 | Update imports: fix all path references |
| 4 | 17-20 | Validation: tests, build, lint, commit |
| 5 | 21-22 | Documentation: update README and architecture docs |

Total: 22 tasks
