# Plan

## Status: ✅ Complete

- [x] Lint: 0 warnings, 0 errors
- [x] Tests: 110 passed
- [x] Build: Success

## Final Structure

```
src/
├── main.ts              # Composition root - wires all modules
│
├── cli/                 # Command parsing
│   ├── opencode-bui.ts     # CLI entrypoint
│   └── onboard/            # Setup wizard
│
├── api/                 # External interface
│   ├── server.ts           # RPC server
│   ├── client.ts           # Plugin client SDK
│   └── discovery/          # Service discovery
│
├── agent/               # Agent runtime (OpenCode)
│   ├── client/             # Spawn/control agents
│   ├── commands/           # Command discovery
│   └── agent.ts            # Event parsing
│
├── runtime/             # Core orchestrator
│   ├── runtime.ts          # Main entry
│   ├── config/             # Config loading
│   ├── bridge/             # Bridge framework
│   │   ├── adapters/       # telegram, discord
│   │   ├── registry/
│   │   └── supervisor/
│   ├── handlers/
│   ├── middleware/
│   ├── logger/
│   └── services/
│
└── database/            # Storage
    ├── db.ts               # Database connection
    ├── schema.ts           # Table definitions
    ├── session-store.ts
    ├── permission-store.ts
    └── media-store.ts
```

## Completed Tasks

### 1. Module entrypoints ✅
- [x] runtime/index.ts exports startRuntime()
- [x] database/index.ts exports createRuntimeDB(), stores
- [x] api/index.ts exports server + client
- [x] agent/index.ts exports createOpenCodeClient()

### 2. Composition root ✅
- [x] Created src/main.ts

### 3. Database reorganized ✅
- [x] Flattened db/* → database/
- [x] Flattened store/* → database/

### 4. Adapters moved ✅
- [x] adapters/ → runtime/bridge/adapters/

### 5. Bridge framework moved ✅
- [x] bridge/* → runtime/bridge/

### 6. Config moved ✅
- [x] config/* → runtime/config/

### 7. opencode renamed ✅
- [x] opencode/ → agent/

### 8. Client merged ✅
- [x] client/ → api/

### 9. Imports updated ✅
- [x] tsconfig.json paths
- [x] All imports fixed

### 10. Validated ✅
- [x] Lint: 0 errors
- [x] Tests: 110 passed
- [x] Build: Success
