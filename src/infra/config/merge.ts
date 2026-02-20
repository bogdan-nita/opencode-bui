import { resolve } from "node:path";
import { z } from "zod";
import { defu } from "defu";
import { loadConfig } from "c12";
import { mergedConfigSchema, type MergedConfigInput, userConfigSchema } from "./config.schema";
import type { ConfigDiscovery, RuntimeConfig } from "./config.types";
import { discoverConfigContext, homeDir, resolveDefaultDbDir } from "./paths";
import { loadEnvFiles, fromEnv } from "./env";
import { parseAllowedUsers, parseUserIds, splitAllowedUsers, toFriendlyZodError } from "./validation";

type LooseInput = Record<string, unknown>;

let cachedConfig: RuntimeConfig | undefined;

function defaultsInput(discovery?: ConfigDiscovery, defaultDbDir?: string): MergedConfigInput {
  const runtimeDir = process.env.BUI_RUNTIME_DIR?.trim() || discovery?.nearestBuiDir || resolve(homeDir(), ".config", "opencode", "bui");

  const dbBaseDir = defaultDbDir || discovery?.nearestBuiDir || runtimeDir;

  return {
    opencodeBin: "opencode",
    opencodeAttachUrl: "",
    sessionIdleTimeoutSeconds: 900,
    runtimeDir,
    dbPath: resolve(dbBaseDir, "opencode-bui.db"),
    uploadDir: resolve(runtimeDir, "uploads"),
    lockPath: resolve(runtimeDir, "telegram-bot.lock"),
    bridges: {
      telegram: {
        enabled: true,
        token: "",
        allowedUserIds: [],
        allowedUsers: [],
        sttCommand: "",
        sttTimeoutMs: 120000,
        backlogStaleSeconds: 45,
        backlogBatchWindowMs: 1200,
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
  };
}

function fromUserConfig(raw: unknown): LooseInput {
  const parsed = userConfigSchema.parse(raw ?? {});
  return {
    opencodeBin: parsed.opencodeBin?.trim() || undefined,
    opencodeAttachUrl: parsed.opencodeAttachUrl?.trim() || undefined,
    sessionIdleTimeoutSeconds: parsed.sessionIdleTimeoutSeconds,
    runtimeDir: parsed.runtimeDir?.trim() || undefined,
    dbPath: parsed.dbPath?.trim() || undefined,
    uploadDir: parsed.uploadDir?.trim() || undefined,
    lockPath: parsed.lockPath?.trim() || undefined,
    bridges: {
      telegram: {
        enabled: parsed.bridges?.telegram?.enabled,
        token: parsed.bridges?.telegram?.token?.trim() || undefined,
        allowedUserIds: parseUserIds(parsed.bridges?.telegram?.allowedUserIds),
        allowedUsers: parseAllowedUsers(parsed.bridges?.telegram?.allowedUsers),
        sttCommand: parsed.bridges?.telegram?.sttCommand?.trim() || undefined,
        sttTimeoutMs: parsed.bridges?.telegram?.sttTimeoutMs,
        backlogStaleSeconds: parsed.bridges?.telegram?.backlogStaleSeconds,
        backlogBatchWindowMs: parsed.bridges?.telegram?.backlogBatchWindowMs,
        polling: parsed.bridges?.telegram?.polling,
        commands: parsed.bridges?.telegram?.commands,
        formatting: parsed.bridges?.telegram?.formatting,
      },
      discord: {
        enabled: parsed.bridges?.discord?.enabled,
        token: parsed.bridges?.discord?.token?.trim() || undefined,
        applicationId: parsed.bridges?.discord?.applicationId?.trim() || undefined,
        guildScope: parsed.bridges?.discord?.guildScope,
        commandSyncMode: parsed.bridges?.discord?.commandSyncMode,
        defaultGuildId: parsed.bridges?.discord?.defaultGuildId,
      },
    },
  };
}

export function buildRuntimeConfig(input: LooseInput, discovery: ConfigDiscovery = {}): RuntimeConfig {
  const merged = mergedConfigSchema.parse(defu(input, defaultsInput(discovery)));
  const parsedAllowedUsers = splitAllowedUsers(merged.bridges.telegram.allowedUsers);
  const telegramAllowedIds = new Set<number>([
    ...merged.bridges.telegram.allowedUserIds,
    ...parsedAllowedUsers.ids,
  ]);

  if (merged.bridges.telegram.enabled && !merged.bridges.telegram.token) {
    throw new Error("Bridge 'telegram' is enabled but token is missing. Set bridges.telegram.token or TELEGRAM_BOT_TOKEN.");
  }
  if (merged.bridges.discord.enabled && !merged.bridges.discord.token) {
    throw new Error("Bridge 'discord' is enabled but token is missing. Set bridges.discord.token or DISCORD_BOT_TOKEN.");
  }

  return {
    opencodeBin: merged.opencodeBin,
    ...(merged.opencodeAttachUrl ? { opencodeAttachUrl: merged.opencodeAttachUrl } : {}),
    sessionIdleTimeoutSeconds: merged.sessionIdleTimeoutSeconds,
    paths: {
      runtimeDir: merged.runtimeDir,
      dbPath: merged.dbPath,
      uploadDir: merged.uploadDir,
      lockPath: merged.lockPath,
    },
    bridges: {
      telegram: {
        enabled: merged.bridges.telegram.enabled,
        token: merged.bridges.telegram.token,
        allowedUsers: {
          ids: telegramAllowedIds,
          usernames: new Set(parsedAllowedUsers.usernames),
        },
        sttCommand: merged.bridges.telegram.sttCommand,
        sttTimeoutMs: merged.bridges.telegram.sttTimeoutMs,
        backlogStaleSeconds: merged.bridges.telegram.backlogStaleSeconds,
        backlogBatchWindowMs: merged.bridges.telegram.backlogBatchWindowMs,
        polling: merged.bridges.telegram.polling,
        commands: merged.bridges.telegram.commands,
        formatting: merged.bridges.telegram.formatting,
      },
      discord: {
        enabled: merged.bridges.discord.enabled,
        token: merged.bridges.discord.token,
        applicationId: merged.bridges.discord.applicationId,
        guildScope: merged.bridges.discord.guildScope,
        commandSyncMode: merged.bridges.discord.commandSyncMode,
        ...(merged.bridges.discord.defaultGuildId ? { defaultGuildId: merged.bridges.discord.defaultGuildId } : {}),
      },
    },
    discovery,
  };
}

export function resolvePaths(input: LooseInput): RuntimeConfig["paths"] {
  const merged = mergedConfigSchema.parse(defu(input, defaultsInput()));
  return {
    runtimeDir: merged.runtimeDir,
    dbPath: merged.dbPath,
    uploadDir: merged.uploadDir,
    lockPath: merged.lockPath,
  };
}

export function resetRuntimeConfigCache(): void {
  cachedConfig = undefined;
}

export async function readRuntimeConfig(options?: { fresh?: boolean; loadEnvFiles?: boolean; cwd?: string }): Promise<RuntimeConfig> {
  if (!options?.fresh && cachedConfig) {
    return cachedConfig;
  }

  const discovery = await discoverConfigContext(options?.cwd ?? process.cwd());
  if (options?.loadEnvFiles !== false) {
    loadEnvFiles({ override: true, discovery });
  }

  try {
    const cwd = options?.cwd ?? process.cwd();
    const loadMain = await loadConfig({ name: "opencode-bui", dotenv: false, defaults: {}, cwd });
    const loadNearOpencode = discovery.nearestOpencodeDir
      ? await loadConfig({ name: "opencode-bui", dotenv: false, defaults: {}, cwd: discovery.nearestOpencodeDir })
      : { config: {} };
    const loadNearBui = discovery.nearestBuiDir
      ? await loadConfig({ name: "opencode-bui", dotenv: false, defaults: {}, cwd: discovery.nearestBuiDir })
      : { config: {} };
    const loadDefaultBui = await loadConfig({
      name: "opencode-bui",
      dotenv: false,
      defaults: {},
      cwd: resolve(homeDir(), ".config", "opencode", "bui"),
    });

    const envConfig = fromEnv();
    const mainConfig = fromUserConfig(loadMain.config);
    const nearBuiConfig = fromUserConfig(loadNearBui.config);
    const nearOpencodeConfig = fromUserConfig(loadNearOpencode.config);
    const defaultBuiConfig = fromUserConfig(loadDefaultBui.config);

    const explicitDbPath = [
      envConfig.dbPath,
      nearBuiConfig.dbPath,
      mainConfig.dbPath,
      nearOpencodeConfig.dbPath,
      defaultBuiConfig.dbPath,
    ].find((value): value is string => typeof value === "string" && value.length > 0);

    const defaultDbDir = explicitDbPath ? undefined : await resolveDefaultDbDir(discovery);

    const merged = defu(
      envConfig,
      nearBuiConfig,
      mainConfig,
      nearOpencodeConfig,
      defaultBuiConfig,
      defaultsInput(discovery, defaultDbDir),
    );

    const runtime = buildRuntimeConfig(merged, discovery);
    cachedConfig = runtime;
    return runtime;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(toFriendlyZodError(error));
    }
    if (error instanceof Error) {
      throw new Error(`Failed to load OpenCode BUI config: ${error.message}`);
    }
    throw error;
  }
}
