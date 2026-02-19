# Storage and Database

## Stack

- Local DB: LibSQL (`@libsql/client`)
- ORM: Drizzle (`drizzle-orm`)

## Paths

- If a local context DB exists (`.opencode/bui/opencode-bui.db` or `<opencode-root>/opencode-bui.db`), it is used.
- Otherwise BUI falls back to global `~/.config/opencode/bui/opencode-bui.db`.
- If global DB does not exist yet, runtime creates it on first start.
- Override with `BUI_DB_PATH` or `dbPath` in config.

## Schema

- `conversation_sessions`
- `session_workdirs`
- `agent_templates`
- `permission_requests` (pending/submitted/expired permission state for idempotent bridge callbacks)

Defined in `packages/opencode-bui-bridge/src/infra/db/db.schema.ts`.

## Migrations

- Generate migration: `bun run db:generate`
- Apply migration: `bun run db:migrate`

Migration config: `drizzle.config.ts`
Migration files: `drizzle/`

No legacy JSON store migration is performed.
