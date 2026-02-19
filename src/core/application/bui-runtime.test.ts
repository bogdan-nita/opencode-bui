import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startBuiRuntime } from "./bui-runtime.utils.js";
import type { BridgeAdapter, BridgeRuntimeHandlers } from "../ports/bridge-adapter.types.js";
import type { RuntimeConfig } from "@infra/config/config.types.js";

function createTestConfig(root: string): RuntimeConfig {
  return {
    opencodeBin: "opencode",
    paths: {
      runtimeDir: root,
      dbPath: join(root, "opencode-bui.db"),
      uploadDir: join(root, "uploads"),
      lockPath: join(root, "bridge.lock"),
    },
    bridges: {
        telegram: {
          enabled: true,
          token: "token",
          allowedUsers: { ids: new Set<number>(), usernames: new Set<string>() },
        sttCommand: "",
        sttTimeoutMs: 120000,
        backlogStaleSeconds: 45,
        backlogBatchWindowMs: 1,
        polling: { dropPendingUpdates: false },
        commands: { registerOnStart: true },
        formatting: { maxChunkChars: 3900 },
      },
      discord: {
        enabled: false,
        token: "",
        applicationId: "",
        guildScope: "global",
        commandSyncMode: "on-start",
      },
    },
    discovery: { nearestOpencodeDir: root },
  };
}

describe("bui runtime", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "opencode-bui-runtime-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("wires inbound handler and sends outbound", async () => {
    await mkdir(join(root, ".opencode", "commands"), { recursive: true });
    await writeFile(join(root, ".opencode", "commands", "deploy.md"), "# Deploy\n", "utf8");

    const config = createTestConfig(root);
    const sent: Array<string | undefined> = [];
    const registeredCommands: string[] = [];
    let handlers: BridgeRuntimeHandlers | undefined;

    const bridge: BridgeAdapter = {
      id: "telegram",
      capabilities: {
        slashCommands: true,
        buttons: true,
        mediaUpload: true,
        mediaDownload: true,
        messageEdit: false,
        threads: false,
        markdown: "limited",
      },
      async start(nextHandlers) {
        handlers = nextHandlers;
      },
      async stop() {
        return;
      },
      async send(envelope) {
        sent.push(envelope.text);
      },
      async setCommands(commands) {
        registeredCommands.push(...commands.map((entry) => entry.command));
      },
      async health() {
        return { bridgeId: "telegram", status: "ready" };
      },
    };

    const createClientMock = vi.spyOn(await import("@infra/opencode/open-code-client.utils.js"), "createOpenCodeClient").mockReturnValue({
      async createSession() {
        return { sessionId: "s1", text: "ready" };
      },
      async runPrompt() {
        return { sessionId: "s1", text: "ok" };
      },
      async runCommand() {
        return { sessionId: "s1", text: "ok" };
      },
    });

    await startBuiRuntime({ config, bridges: [bridge], waitForShutdown: false });

    await handlers?.onInbound({
      bridgeId: "telegram",
      conversation: { bridgeId: "telegram", channelId: "1" },
      channel: { id: "1", kind: "dm" },
      user: { id: "1" },
      receivedAtUnixSeconds: Math.floor(Date.now() / 1000),
      event: { type: "text", text: "hello" },
    });

    expect(sent.some((value) => value?.includes("ok"))).toBe(true);
    expect(registeredCommands).toContain("start");
    expect(registeredCommands).toContain("deploy");
    createClientMock.mockRestore();
  });
});
