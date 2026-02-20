import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeDB } from "./client";
import { createLibsqlAgentStore } from "../entities/agent/agent.store";
import { createFileMediaStore } from "../entities/media/media.store";
import { createLibsqlPermissionStore } from "../entities/permission/permission.store";
import { createLibsqlSessionStore } from "../entities/session/session.store";

describe("db utils", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock("@infra/fs");
    await Promise.all(tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
  });

  it("finds migrations folder from first matching candidate", async () => {
    vi.doMock("@infra/fs", () => ({
      fileExists: async (path: string) => path === resolve(process.cwd(), "drizzle"),
    }));

    const { resolveMigrationsFolder: resolveMigrations } = await import("./client");
    expect(await resolveMigrations()).toBe(resolve(process.cwd(), "drizzle"));
  });

  it("returns undefined when migrations folder is missing", async () => {
    vi.doMock("@infra/fs", () => ({
      fileExists: async () => false,
    }));

    const { resolveMigrationsFolder: resolveMigrations } = await import("./client");
    expect(await resolveMigrations()).toBeUndefined();
  });

  it("creates required tables even when migrations are skipped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-bui-db-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "opencode-bui.db");

    const database = await createRuntimeDB(dbPath, { findMigrationsFolder: async () => undefined });

    const result = await database.client.execute(
      "select name from sqlite_master where type='table' and name in ('conversation_sessions','session_workdirs','agent_templates','permission_requests') order by name",
    );

    expect(result.rows.length).toBe(4);
    database.client.close();
  });
});

describe("libsql stores", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "opencode-bui-libsql-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores and reads session mapping", async () => {
    const db = await createRuntimeDB(join(root, "opencode-bui.db"));
    const store = createLibsqlSessionStore(db);

    await store.setSessionForConversation({ bridgeId: "telegram", channelId: "123" }, "sess-1", "/tmp/work");
    const mapping = await store.getSessionByConversation({ bridgeId: "telegram", channelId: "123" });

    expect(mapping?.sessionId).toBe("sess-1");
    expect(mapping?.cwd).toBe("/tmp/work");
    db.client.close();
  });

  it("resolves pending permissions", async () => {
    const db = await createRuntimeDB(join(root, "opencode-bui.db"));
    const store = createLibsqlPermissionStore(db);

    await store.createPending({
      permissionId: "perm-1",
      conversationKey: "telegram:1",
      requesterUserId: "user-1",
      expiresAtUnixSeconds: Math.floor(Date.now() / 1000) + 60,
    });
    const resolution = await store.resolvePending({ permissionId: "perm-1", response: "once" });
    const record = await store.getByID("perm-1");

    expect(resolution).toBe("resolved");
    expect(record?.status).toBe("submitted");
    expect(record?.response).toBe("once");
    db.client.close();
  });

  it("stores and reads agent templates", async () => {
    const db = await createRuntimeDB(join(root, "opencode-bui.db"));
    const store = createLibsqlAgentStore(db);

    await store.save("triage", "Triage this: {{args}}");
    const agent = await store.get("triage");

    expect(agent?.name).toBe("triage");
    expect(agent?.template).toContain("{{args}}");
    db.client.close();
  });

  it("writes media files using sanitized file names", async () => {
    const store = createFileMediaStore(join(root, "uploads"));
    const filePath = await store.saveRemoteFile({
      bridgeId: "telegram",
      conversationId: "conversation-1",
      fileNameHint: "unsafe name?.png",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(filePath).toContain("unsafe_name_.png");
  });
});
