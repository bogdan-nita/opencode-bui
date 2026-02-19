import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileExists } from "@infra/runtime/runtime-fs.utils.js";
import type { BuiDb } from "./db.types.js";

async function resolveMigrationsFolder(): Promise<string | undefined> {
  const moduleDir = fileURLToPath(new URL(".", import.meta.url));
  const candidates = [resolve(process.cwd(), "drizzle"), resolve(moduleDir, "../../../drizzle")];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export async function createBuiDb(dbPath: string): Promise<BuiDb> {
  const client = createClient({
    url: `file:${dbPath}`,
  });

  const db = drizzle(client);
  const migrationsFolder = await resolveMigrationsFolder();
  if (migrationsFolder) {
    await migrate(db, { migrationsFolder });
  }

  await client.execute(`
    create table if not exists conversation_sessions (
      conversation_key text primary key,
      bridge_id text not null,
      channel_id text not null,
      thread_id text,
      session_id text not null,
      cwd text,
      updated_at text not null
    )
  `);

  await client.execute(`
    create table if not exists session_workdirs (
      session_id text primary key,
      cwd text not null,
      updated_at text not null
    )
  `);

  await client.execute(`
    create table if not exists agent_templates (
      name text primary key,
      template text not null,
      created_at text not null,
      updated_at text not null
    )
  `);

  await client.execute(`
    create table if not exists permission_requests (
      permission_id text primary key,
      conversation_key text not null,
      requester_user_id text not null,
      status text not null,
      response text,
      expires_at_unix_seconds text not null,
      created_at text not null,
      updated_at text not null
    )
  `);

  return {
    client,
    db,
  };
}
