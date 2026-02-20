# Plan

## Status: ✅ All refactoring complete

- [x] Lint: 0 warnings, 0 errors
- [x] Tests: 112 passed
- [x] Build: Pass

## Completed

### 1. Split runtime/runtime.ts (1058 → 98 lines)
- [x] Extract to handlers/ folder [developer]
- [x] Extract to middleware/ folder [developer]
- [x] Extract to state/ folder [developer]

### 2. Split opencode/open-code-client.ts (799 → 38 lines)
- [x] Split into client-core.ts, client.utils.ts, client.types.ts, client.schema.ts [developer]
- [x] Extract types to schema file [developer]

### 3. Split config/config.utils.ts (512 → deleted)
- [x] Extract path resolution to config/paths.ts [developer]
- [x] Extract env loading to config/env.ts [developer]
- [x] Extract config merging to config/merge.ts [developer]
- [x] Extract validation to config/validation.ts [developer]

### 4. Split telegram.bridge.ts (398 → 160 lines)
- [x] Extract handlers to adapters/telegram/handlers/ [developer]
- [x] Extract middleware to adapters/telegram/middleware/ [developer]

### 5. Split discord.bridge.ts (370 → 198 lines)
- [x] Extract handlers to adapters/discord/handlers/ [developer]
- [x] Extract middleware to adapters/discord/middleware/ [developer]

### 6. Fix barrel files
- [x] Remove config/config.ts [developer]
- [x] Remove bridge-definition/bridge-definition.ts [developer]
- [x] Remove runtime/services/services.ts [developer]

### 7. Consolidate tiny type files
- [x] Merge telegram.types.ts into telegram.schema.ts [developer]
- [x] Merge discord.types.ts into discord.schema.ts [developer]

### 8. Fix broken imports (found by reviewer)
- [x] Fix @config/config/config.types → @config/config.types [developer]
- [x] Fix @config/config → @config [developer]
- [x] Fix ../../ports/bridge-adapter.types → @bridge/bridge-adapter.types [developer]
- [x] Fix ../domain/bridge.types → ./bridge.types [developer]
- [x] Fix ../../ports/open-code-client.types → @bridge/open-code-client.types [developer]

### 9. Fix lint warnings
- [x] Fix `as any` casts in test files [developer]

### 10. Validate
- [x] Lint: 0 warnings, 0 errors [reviewer]
- [x] Tests: 112 passed [tester]
- [x] Build: Success [reviewer]
