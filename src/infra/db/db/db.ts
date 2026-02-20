import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileExists } from "@infra/runtime/runtime-fs";
import { REQUIRED_TABLE_STATEMENTS } from "./db.consts";
import type { RuntimeDB, RuntimeDBFactoryOptions } from "./db.types";

export async function resolveMigrationsFolder(): Promise<string | undefined> {
  const moduleDir = fileURLToPath(new URL(".", import.meta.url));
  const candidates = [resolve(process.cwd(), "drizzle"), resolve(moduleDir, "../../../../drizzle")];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export async function createRuntimeDB(dbPath: string, options?: RuntimeDBFactoryOptions): Promise<RuntimeDB> {
  const client = createClient({
    url: `file:${dbPath}`,
  });

  const db = drizzle(client);
  const findMigrationsFolder = options?.findMigrationsFolder ?? resolveMigrationsFolder;
  const migrationsFolder = await findMigrationsFolder();
  if (migrationsFolder) {
    await migrate(db, { migrationsFolder });
  }

  for (const statement of REQUIRED_TABLE_STATEMENTS) {
    await client.execute(statement);
  }

  return {
    client,
    db,
  };
}

export {
  agentTemplatesTable,
  conversationSessionsTable,
  permissionRequestsTable,
  sessionWorkdirsTable,
} from "./db.schema";
export type { RuntimeDB, RuntimeDBFactoryOptions } from "./db.types";
