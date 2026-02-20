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
├── bin/              # CLI entrypoints
│   └── onboard/     # First-time setup
├── bridges/         # Bridge implementations
│   ├── telegram/    # Telegram bridge
│   └── discord/    # Discord bridge
├── core/            # Core runtime (bridge-agnostic)
│   ├── application/ # Orchestration services
│   ├── agents/      # Agent definitions
│   ├── config/     # Config module
│   ├── domain/     # Domain models
│   ├── lock/       # Locking primitives
│   ├── opencode/   # OpenCode integration
│   └── store/      # Store interfaces
├── infra/           # Infrastructure
│   ├── config/     # Config loading
│   ├── db/        # Database (LibSQL + Drizzle)
│   ├── lock/      # File lock service
│   ├── opencode/  # OpenCode client & commands
│   ├── plugin-bridge/ # Plugin-bridge API
│   ├── runtime/   # Logger, FS, Process
│   ├── store/     # LibSQL stores
│   └── time/      # Time utilities
├── common/         # Shared utilities
├── plugin/         # OpenCode plugin
└── bridge-client/  # Bridge client SDK
```

## Architecture

- **Bridge-agnostic core**: `src/core/application/` contains orchestration
- **Bridge-owned behavior**: Each bridge owns its behavior contract in `src/bridges/<name>/`
- **No bridge-type branching** in core policy logic

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
