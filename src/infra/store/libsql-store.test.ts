import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBuiDb } from "@infra/db/db.utils.js";
import { createLibsqlAgentStore } from "./libsql-agent-store.utils.js";
import { createLibsqlSessionStore } from "./libsql-session-store.utils.js";

describe("libsql stores", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "opencode-bui-libsql-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores and reads session mapping", async () => {
    const db = await createBuiDb(join(root, "opencode-bui.db"));
    const store = createLibsqlSessionStore(db);

    await store.setSessionForConversation({ bridgeId: "telegram", channelId: "123" }, "sess-1", "/tmp/work");
    const mapping = await store.getSessionByConversation({ bridgeId: "telegram", channelId: "123" });

    expect(mapping?.sessionId).toBe("sess-1");
    expect(mapping?.cwd).toBe("/tmp/work");
  });

  it("stores and reads agent templates", async () => {
    const db = await createBuiDb(join(root, "opencode-bui.db"));
    const store = createLibsqlAgentStore(db);

    await store.save("triage", "Triage this: {{args}}");
    const agent = await store.get("triage");

    expect(agent?.name).toBe("triage");
    expect(agent?.template).toContain("{{args}}");
  });
});
