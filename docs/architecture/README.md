# Architecture

## Core Principles

1. **Bridge-agnostic core**: Core runtime in `src/core/` knows nothing about Telegram/Discord
2. **Bridge-owned behavior**: Each bridge owns its behavior contract in `src/bridge/<name>/`
3. **No bridge-type branching**: Core policy logic never checks bridge type
4. **Core + Infra separation**: Orchestration in `core/`, utilities in `infra/`

## Folder Structure

```
src/
├── main.ts              # Composition root
├── cli/                 # CLI entrypoints
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
```

## Key Services

### Runtime (`core/runtime/`)
Main entry point. Coordinates all services.

### Bridge Registry (`bridge/registry/`)
Discovers and registers available bridges.

### Bridge Supervisor (`bridge/supervisor/`)
Manages bridge lifecycle (start, stop, health).

### Conversation Router (`core/conversation-router/`)
Routes incoming messages to appropriate conversation/session.

### Command Router (`core/command-router/`)
Routes commands (like `/new`, `/session`) to handlers.

### Permission Store (`database/entities/permission/`)
Manages user permissions.

### Session Store (`database/entities/session/`)
Manages session state.

## Data Flow

```
User Message → Bridge → Conversation Router → Core → Agent
                 ↑                                    ↓
                 ←────── Response ←───────────────←──┘
```

## Import Path Aliases

| Alias | Path |
|-------|------|
| `@core` | `src/core` |
| `@agent` | `src/agent` |
| `@api` | `src/api` |
| `@bridge` | `src/bridge` |
| `@database` | `src/database` |
| `@infra` | `src/infra` |

## Storage

- **LibSQL** with Drizzle ORM
- Stores: sessions, permissions, agents, media
- Configurable via `runtimeDir` and `dbPath`

## See Also

- `docs/architecture/core-runtime.md` - Runtime layers and flow
- `docs/architecture/bridges.md` - Bridge contract
- `docs/architecture/storage.md` - Database schema
