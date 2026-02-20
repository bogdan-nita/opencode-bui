# OpenCode BUI

Bun-first bridge-agnostic runtime that exposes OpenCode sessions through bridge adapters (Telegram, Discord).

## Quick Start

```bash
bun install
bun run onboard   # First time setup
bun run dev      # Run with Telegram control
bun run start    # Production start
```

## Project Structure

```
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
```

## Architecture

- **Core orchestrator**: `src/core/` contains main runtime logic
- **Bridge system**: `src/bridge/` handles Telegram/Discord adapters
- **Agent integration**: `src/agent/` manages OpenCode client
- **API server**: `src/api/` provides plugin-bridge interface
- **Storage layer**: `src/database/` with LibSQL + Drizzle
- **Infrastructure**: `src/infra/` for config, logger, fs, etc.

### Key Modules

| Module | Purpose |
|--------|---------|
| `runtime` | Main orchestration |
| `bridge-registry` | Bridge discovery/management |
| `bridge-supervisor` | Bridge lifecycle |
| `conversation-router` | Routes messages to conversations |
| `command-router` | Routes commands to handlers |
| `permission-store` | User permissions |
| `session-store` | Session state |

## Commands

```bash
bun run dev        # Dev mode with Telegram control
bun run start      # Production
bun run onboard    # First-time setup
bun run doctor     # Diagnostics
bun run bridge:test # Bridge test
```

## Quality Gates

```bash
bun run lint
bun run test
bun run build
bun run test:coverage
```

## Configuration

Config precedence (highest first):
1. Environment variables
2. `opencode-bui.config.ts` in cwd
3. `opencode.json` + `bui/` folder
4. `~/.config/opencode/bui`

See full config options in main documentation.

## Agents

- **Developer**: Implement features, fix bugs
- **Reviewer**: Review PRs
- **Tester**: Write tests
- **Planner**: Track requirements, coordinate

See `AGENTS.md` for details.

## Docs

- `docs/architecture/` - Architecture deep-dive
- `docs/usage/` - Usage guides
- `docs/contribution/` - Contribution guidelines
