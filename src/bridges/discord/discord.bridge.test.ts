import { describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "@infra/config/config.types.js";
import { registerDiscordCommands } from "./discord.bridge.js";

function createConfig(): RuntimeConfig {
  return {
    opencodeBin: "opencode",
    paths: {
      runtimeDir: "/tmp/runtime",
      dbPath: "/tmp/runtime/opencode-bui.db",
      uploadDir: "/tmp/runtime/uploads",
      lockPath: "/tmp/runtime/bridge.lock",
    },
    bridges: {
      telegram: {
        enabled: false,
        token: "",
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
        token: "token",
        applicationId: "app-1",
        guildScope: "global",
        commandSyncMode: "on-start",
      },
    },
    discovery: {},
  };
}

describe("registerDiscordCommands", () => {
  it("registers commands with global route", async () => {
    const config = createConfig();
    const put = vi.fn(async () => undefined);
    const applicationCommands = vi.fn((applicationId: string) => `/global:${applicationId}` as const);
    const applicationGuildCommands = vi.fn((applicationId: string, guildId: string) => `/guild:${applicationId}:${guildId}` as const);

    await registerDiscordCommands(
      config,
      [{ command: "start", description: "Show bot help" }],
      { put },
      { applicationCommands, applicationGuildCommands },
    );

    expect(applicationCommands).toHaveBeenCalledWith("app-1");
    expect(applicationGuildCommands).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith("/global:app-1", expect.objectContaining({ body: expect.any(Array) }));
  });

  it("registers commands with guild route when guild scope is configured", async () => {
    const config = createConfig();
    config.bridges.discord.guildScope = "guild";
    config.bridges.discord.defaultGuildId = "guild-1";

    const put = vi.fn(async () => undefined);
    const applicationCommands = vi.fn((applicationId: string) => `/global:${applicationId}` as const);
    const applicationGuildCommands = vi.fn((applicationId: string, guildId: string) => `/guild:${applicationId}:${guildId}` as const);

    await registerDiscordCommands(
      config,
      [{ command: "start", description: "Show bot help" }],
      { put },
      { applicationCommands, applicationGuildCommands },
    );

    expect(applicationGuildCommands).toHaveBeenCalledWith("app-1", "guild-1");
    expect(applicationCommands).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledWith("/guild:app-1:guild-1", expect.objectContaining({ body: expect.any(Array) }));
  });
});
