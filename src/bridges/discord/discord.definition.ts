import type { BridgeDefinition } from "@core/application/bridge-definition";
import { createDiscordBridge } from "./discord.bridge";

async function timedDiscordHealthcheck(token: string, timeoutMs: number): Promise<{ ok: boolean; latencyMs: number; details: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      method: "GET",
      headers: {
        Authorization: `Bot ${token}`,
      },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        details: (await response.text()) || `HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      latencyMs,
      details: "Token valid and Discord API reachable",
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: timeoutMs,
      details: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const discordBridgeDefinition: BridgeDefinition = {
  id: "discord",
  label: "Discord",
  createAdapter: createDiscordBridge,
  assertConfigured(config) {
    if (!config.bridges.discord.enabled) {
      throw new Error("Bridge 'discord' is disabled in config. Enable it in bridges.discord.enabled.");
    }
    if (!config.bridges.discord.token) {
      throw new Error("Bridge 'discord' is enabled but token is missing. Set bridges.discord.token or DISCORD_BOT_TOKEN.");
    }
    if (!config.bridges.discord.applicationId) {
      throw new Error("Bridge 'discord' is enabled but applicationId is missing. Set bridges.discord.applicationId or DISCORD_APPLICATION_ID.");
    }
  },
  async healthcheck(config, timeoutMs) {
    const result = await timedDiscordHealthcheck(config.bridges.discord.token, timeoutMs);
    return {
      bridge: "discord",
      ok: result.ok,
      latencyMs: result.latencyMs,
      details: result.details,
    };
  },
  runtimePolicy(_config) {
    return {
      backlog: {
        enabled: true,
        staleSeconds: 45,
        batchWindowMs: 1200,
      },
    };
  },
  onboarding: {
    renderConfig(enabled) {
      return [
        "    discord: {",
        `      enabled: ${enabled ? "true" : "false"},`,
        "      token: process.env.DISCORD_BOT_TOKEN || \"\",",
        "      applicationId: process.env.DISCORD_APPLICATION_ID || \"\",",
        "      guildScope: \"global\",",
        "      commandSyncMode: \"on-start\",",
        "    },",
      ];
    },
    env: [
      { key: "DISCORD_BOT_TOKEN", prompt: "Discord bot token" },
      { key: "DISCORD_APPLICATION_ID", prompt: "Discord application id" },
    ],
  },
};
