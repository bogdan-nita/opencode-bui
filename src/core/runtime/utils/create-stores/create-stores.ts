import { createRuntimeDB, createFileMediaStore, createLibsqlAgentStore, createLibsqlPermissionStore, createLibsqlSessionStore } from "@database";
import type { RuntimeDB } from "@database";

export type CreateStoresOptions = {
  dbPath: string;
  uploadDir: string;
};

export type RuntimeStores = {
  database: RuntimeDB;
  sessionStore: ReturnType<typeof createLibsqlSessionStore>;
  agentStore: ReturnType<typeof createLibsqlAgentStore>;
  mediaStore: ReturnType<typeof createFileMediaStore>;
  permissionStore: ReturnType<typeof createLibsqlPermissionStore>;
};

export async function createStores(options: CreateStoresOptions): Promise<RuntimeStores> {
  const database = await createRuntimeDB(options.dbPath);
  
  return {
    database,
    sessionStore: createLibsqlSessionStore(database),
    agentStore: createLibsqlAgentStore(database),
    mediaStore: createFileMediaStore(options.uploadDir),
    permissionStore: createLibsqlPermissionStore(database),
  };
}
