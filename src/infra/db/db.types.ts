import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

export type BuiDb = {
  client: Client;
  db: LibSQLDatabase;
};
