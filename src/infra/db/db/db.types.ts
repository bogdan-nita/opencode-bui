import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

export type RuntimeDB = {
  client: Client;
  db: LibSQLDatabase;
};

export type RuntimeDBFactoryOptions = {
  findMigrationsFolder?: () => Promise<string | undefined>;
};
