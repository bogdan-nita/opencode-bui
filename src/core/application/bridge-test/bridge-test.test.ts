import { afterEach, describe, expect, it, vi } from "vitest";
import { testBridgeConnectivity } from "./bridge-test";
import type { RuntimeConfig } from "@infra/config/config";

function baseConfig(): RuntimeConfig {
  return {
    opencodeBin: "opencode",
    sessionIdleTimeoutSeconds: 900,
    paths: {
      runtimeDir: "/tmp/bui",
      dbPath: "/tmp/bui/opencode-bui.db",
      uploadDir: "/tmp/bui/uploads",
      lockPath: "/tmp/bui/bridge.lock",
    },
    bridges: {
      telegram: {
        enabled: true,
        token: "telegram-token",
        allowedUsers: { ids: new Set<number>(), usernames: new Set<string>() },
        sttCommand: "",
        sttTimeoutMs: 120000,
        backlogStaleSeconds: 45,
        backlogBatchWindowMs: 1200,
        polling: { dropPendingUpdates: false },
        commands: { registerOnStart: true },
        formatting: { maxChunkChars: 3900 },
      },
      discord: {
        enabled: true,
        token: "discord-token",
        applicationId: "app-id",
        guildScope: "global",
        commandSyncMode: "on-start",
      },
    },
    discovery: {},
  };
}

describe("bridge connectivity tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok for successful Telegram test", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await testBridgeConnectivity({
      config: baseConfig(),
      bridges: ["telegram"],
      timeoutMs: 1000,
    });

    expect(result[0]?.ok).toBe(true);
  });

  it("returns failed for unsuccessful Discord test", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("invalid token", { status: 401 }));

    const result = await testBridgeConnectivity({
      config: baseConfig(),
      bridges: ["discord"],
      timeoutMs: 1000,
    });

    expect(result[0]?.ok).toBe(false);
  });
});
