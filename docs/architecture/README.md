# Architecture

## Core Principles

1. **Bridge-agnostic core**: Core runtime in `src/core/application/` knows nothing about Telegram/Discord
2. **Bridge-owned behavior**: Each bridge owns its behavior contract in `src/bridges/<name>/`
3. **No bridge-type branching**: Core policy logic never checks bridge type

## Folder Structure

```
src/core/application/    # Orchestration (bridge-agnostic)
src/bridges/<name>/      # Bridge-specific (owned by bridge)
src/infra/               # Infrastructure (shared)
src/common/              # Shared utilities
```

## Key Services

### Runtime (`runtime/`)
Main entry point. Coordinates all services.

### Bridge Registry (`bridge-registry/`)
Discovers and registers available bridges.

### Bridge Supervisor (`bridge-supervisor/`)
Manages bridge lifecycle (start, stop, health).

### Conversation Router (`conversation-router/`)
Routes incoming messages to appropriate conversation/session.

### Command Router (`command-router/`)
Routes commands (like `/new`, `/session`) to handlers.

### Permission Store (`infra/store/libsql-permission-store/`)
Manages user permissions.

### Session Store (`infra/store/libsql-session-store/`)
Manages session state.

## Data Flow

```
User Message → Bridge → Conversation Router → Runtime → OpenCode
                ↑                                    ↓
                ←────── Response ←───────────────←──┘
```

## Storage

- **LibSQL** with Drizzle ORM
- Stores: sessions, permissions, agents, media
- Configurable via `runtimeDir` and `dbPath`

## See Also

- `docs/architecture/core-runtime.md` - Runtime layers and flow
- `docs/architecture/bridges.md` - Bridge contract
- `docs/architecture/storage.md` - Database schema
