import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("db utils", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock("@infra/runtime/runtime-fs/runtime-fs.js");
    await Promise.all(tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
  });

  it("finds migrations folder from first matching candidate", async () => {
    vi.doMock("@infra/runtime/runtime-fs/runtime-fs.js", () => ({
      fileExists: async (path: string) => path === resolve(process.cwd(), "drizzle"),
    }));

    const { resolveMigrationsFolder } = await import("./db");
    expect(await resolveMigrationsFolder()).toBe(resolve(process.cwd(), "drizzle"));
  });

  it("returns undefined when migrations folder is missing", async () => {
    vi.doMock("@infra/runtime/runtime-fs/runtime-fs.js", () => ({
      fileExists: async () => false,
    }));

    const { resolveMigrationsFolder } = await import("./db");
    expect(await resolveMigrationsFolder()).toBeUndefined();
  });

  it("creates required tables even when migrations are skipped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-bui-db-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "opencode-bui.db");

    const { createRuntimeDB } = await import("./db");
    const db = await createRuntimeDB(dbPath, { findMigrationsFolder: async () => undefined });

    const result = await db.client.execute(
      "select name from sqlite_master where type='table' and name in ('conversation_sessions','session_workdirs','agent_templates','permission_requests') order by name",
    );

    expect(result.rows.length).toBe(4);
    db.client.close();
  });
});
