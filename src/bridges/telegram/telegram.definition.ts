import type { BridgeDefinition } from "@core/application/bridge-definition";
import { z } from "zod";
import { createTelegramBridge } from "./telegram.bridge";

const telegramGetMeSchema = z.object({
  ok: z.boolean().optional(),
  description: z.string().optional(),
});

async function timedFetch(input: string, timeoutMs: number): Promise<{ ok: boolean; latencyMs: number; details: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(input, { method: "GET", signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const parsed = telegramGetMeSchema.safeParse(await response.json().catch(() => ({})));
    const payload = parsed.success ? parsed.data : {};
    if (!response.ok || payload.ok !== true) {
      return {
        ok: false,
        latencyMs,
        details: payload.description || `HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      latencyMs,
      details: "Token valid and Telegram API reachable",
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

export const telegramBridgeDefinition: BridgeDefinition = {
  id: "telegram",
  label: "Telegram",
  createAdapter: createTelegramBridge,
  assertConfigured(config) {
    if (!config.bridges.telegram.enabled) {
      throw new Error("Bridge 'telegram' is disabled in config. Enable it in bridges.telegram.enabled.");
    }
    if (!config.bridges.telegram.token) {
      throw new Error("Bridge 'telegram' is enabled but token is missing. Set bridges.telegram.token or TELEGRAM_BOT_TOKEN.");
    }
  },
  async healthcheck(config, timeoutMs) {
    const result = await timedFetch(`https://api.telegram.org/bot${config.bridges.telegram.token}/getMe`, timeoutMs);
    return {
      bridge: "telegram",
      ok: result.ok,
      latencyMs: result.latencyMs,
      details: result.details,
    };
  },
  runtimePolicy(config) {
    return {
      backlog: {
        enabled: true,
        staleSeconds: config.bridges.telegram.backlogStaleSeconds,
        batchWindowMs: config.bridges.telegram.backlogBatchWindowMs,
      },
    };
  },
  onboarding: {
    renderConfig(enabled) {
      return [
        "    telegram: {",
        `      enabled: ${enabled ? "true" : "false"},`,
        "      token: process.env.TELEGRAM_BOT_TOKEN || \"\",",
        "      allowedUsers: process.env.TELEGRAM_ALLOWED_USERS || \"\",",
        "      allowedUserIds: [],",
        "      backlogStaleSeconds: 45,",
        "      backlogBatchWindowMs: 1200,",
        "      polling: { dropPendingUpdates: false },",
        "      commands: { registerOnStart: true },",
        "      formatting: { maxChunkChars: 3900 },",
        "    },",
      ];
    },
    env: [
      { key: "TELEGRAM_BOT_TOKEN", prompt: "Telegram bot token", placeholder: "12345:ABCDE" },
      {
        key: "TELEGRAM_ALLOWED_USERS",
        prompt: "Allowed Telegram usernames or IDs (comma-separated, optional)",
        placeholder: "@your_username,123456789",
      },
      { key: "TELEGRAM_ALLOWED_USER_IDS" },
    ],
  },
};
