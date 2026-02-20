import { z } from "zod";
import { bridgeNameSchema } from "./config.schema";
import type { BridgeName, RuntimeConfig } from "./config.types";

export function parseNumber(value: string | undefined): number | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseUserIds(value: string | number[] | undefined): number[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.filter((entry) => Number.isFinite(entry));
  }
  return value
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry));
}

export function parseAllowedUsers(value: string | Array<string | number> | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeTelegramUsername(value: string): string | undefined {
  const trimmed = value.trim().replace(/^@+/, "").toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  const cleaned = trimmed.replace(/[^a-z0-9_]/g, "");
  return cleaned.length > 0 ? cleaned : undefined;
}

export function splitAllowedUsers(allowedUsers: string[]): { ids: number[]; usernames: string[] } {
  const ids = new Set<number>();
  const usernames = new Set<string>();

  for (const entry of allowedUsers) {
    const value = entry.trim();
    if (!value) {
      continue;
    }
    if (/^\d+$/.test(value)) {
      const id = Number.parseInt(value, 10);
      if (Number.isFinite(id)) {
        ids.add(id);
      }
      continue;
    }

    const username = normalizeTelegramUsername(value);
    if (username) {
      usernames.add(username);
    }
  }

  return {
    ids: [...ids],
    usernames: [...usernames],
  };
}

export function toFriendlyZodError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
  return `Malformed OpenCode BUI config:\n${details}`;
}

export function assertBridgeConfigured(config: RuntimeConfig, bridge: BridgeName): void {
  if (bridge === "telegram") {
    if (!config.bridges.telegram.enabled) {
      throw new Error("Bridge 'telegram' is disabled in config. Enable it in bridges.telegram.enabled.");
    }
    if (!config.bridges.telegram.token) {
      throw new Error("Bridge 'telegram' is enabled but token is missing. Set bridges.telegram.token or TELEGRAM_BOT_TOKEN.");
    }
    return;
  }

  if (!config.bridges.discord.enabled) {
    throw new Error("Bridge 'discord' is disabled in config. Enable it in bridges.discord.enabled.");
  }
  if (!config.bridges.discord.token) {
    throw new Error("Bridge 'discord' is enabled but token is missing. Set bridges.discord.token or DISCORD_BOT_TOKEN.");
  }
}

export function enabledBridges(config: RuntimeConfig): BridgeName[] {
  return bridgeNameSchema.options.filter((name) => config.bridges[name].enabled);
}
