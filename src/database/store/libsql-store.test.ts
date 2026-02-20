import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRuntimeDB } from "@database/db";
import { createFileMediaStore } from "./file-media-store";
import { createLibsqlAgentStore } from "./libsql-agent-store";
import { createLibsqlPermissionStore } from "./libsql-permission-store";
import { createLibsqlSessionStore } from "./libsql-session-store";

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
  });

  it("stores and reads agent templates", async () => {
    const db = await createRuntimeDB(join(root, "opencode-bui.db"));
    const store = createLibsqlAgentStore(db);

    await store.save("triage", "Triage this: {{args}}");
    const agent = await store.get("triage");

    expect(agent?.name).toBe("triage");
    expect(agent?.template).toContain("{{args}}");
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
