import { basename, dirname, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { loadConfig } from "c12";
import { defu } from "defu";
import { z } from "zod";
import { fileExists } from "@infra/runtime/runtime-fs.utils.js";
import { bridgeNameSchema, mergedConfigSchema, type MergedConfigInput, userConfigSchema } from "./config.schema.js";
import type { BridgeName, ConfigDiscovery, RuntimeConfig } from "./config.types.js";

type LooseInput = Record<string, unknown>;

const BUI_CONFIG_FILES = [
  "opencode-bui.config.ts",
  "opencode-bui.config.mts",
  "opencode-bui.config.js",
  "opencode-bui.config.mjs",
  "opencode-bui.config.cjs",
  "opencode-bui.config.json",
] as const;

let cachedConfig: RuntimeConfig | undefined;

function homeDir(): string {
  return process.env.HOME ?? process.cwd();
}

const pathExists = fileExists;

export async function findNearestOpencodeDir(startDir = process.cwd()): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    const nestedConfig = resolve(current, ".opencode", "opencode.json");
    if (await pathExists(nestedConfig)) {
      return resolve(current, ".opencode");
    }

    const directConfig = resolve(current, "opencode.json");
    if (await pathExists(directConfig)) {
      return current;
    }

    const nestedDir = resolve(current, ".opencode");
    if (await pathExists(nestedDir)) {
      return nestedDir;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export async function findNearestOpencodeConfig(startDir = process.cwd()): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    const nested = resolve(current, ".opencode", "opencode.json");
    if (await pathExists(nested)) {
      return nested;
    }
    const direct = resolve(current, "opencode.json");
    if (await pathExists(direct)) {
      return direct;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export async function findNearestBuiConfig(startDir = process.cwd()): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    for (const name of BUI_CONFIG_FILES) {
      const nestedOpencodeBui = resolve(current, ".opencode", "bui", name);
      if (await pathExists(nestedOpencodeBui)) {
        return nestedOpencodeBui;
      }

      const nestedBui = resolve(current, "bui", name);
      if (await pathExists(nestedBui)) {
        return nestedBui;
      }

      const direct = resolve(current, name);
      if (await pathExists(direct)) {
        return direct;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export async function discoverConfigContext(startDir = process.cwd()): Promise<ConfigDiscovery> {
  const nearestOpencodeDir = await findNearestOpencodeDir(startDir);
  const nearestOpencodeConfig = await findNearestOpencodeConfig(startDir);
  const nearestBuiConfigCandidate = await findNearestBuiConfig(startDir);
  if (!nearestOpencodeDir && !nearestOpencodeConfig && !nearestBuiConfigCandidate) {
    return {};
  }

  const resolvedOpencodeDir = nearestOpencodeDir ?? (nearestOpencodeConfig ? dirname(nearestOpencodeConfig) : undefined);
  const nearestBuiConfig =
    resolvedOpencodeDir && basename(resolvedOpencodeDir) === ".opencode" && nearestBuiConfigCandidate
      ? nearestBuiConfigCandidate.startsWith(`${resolvedOpencodeDir}/`)
        ? nearestBuiConfigCandidate
        : undefined
      : nearestBuiConfigCandidate;
  const resolvedBuiDir = nearestBuiConfig
    ? dirname(nearestBuiConfig)
    : resolvedOpencodeDir
      ? basename(resolvedOpencodeDir) === ".opencode"
        ? resolve(resolvedOpencodeDir, "bui")
        : resolvedOpencodeDir
      : undefined;

  return {
    ...(nearestOpencodeConfig ? { nearestOpencodeConfig } : {}),
    ...(resolvedOpencodeDir ? { nearestOpencodeDir: resolvedOpencodeDir } : {}),
    ...(nearestBuiConfig ? { nearestBuiConfig } : {}),
    ...(resolvedBuiDir ? { nearestBuiDir: resolvedBuiDir } : {}),
  };
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseUserIds(value: string | number[] | undefined): number[] | undefined {
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

function parseAllowedUsers(value: string | Array<string | number> | undefined): string[] | undefined {
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

function normalizeTelegramUsername(value: string): string | undefined {
  const trimmed = value.trim().replace(/^@+/, "").toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  const cleaned = trimmed.replace(/[^a-z0-9_]/g, "");
  return cleaned.length > 0 ? cleaned : undefined;
}

function splitAllowedUsers(allowedUsers: string[]): { ids: number[]; usernames: string[] } {
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

export function loadEnvFiles(options?: { override?: boolean; discovery?: ConfigDiscovery }): void {
  const override = options?.override ?? true;
  const d = options?.discovery;

  const candidates = [
    process.env.BUI_ENV_PATH,
    process.env.TELEGRAM_PLUGIN_ENV,
    d?.nearestBuiDir ? resolve(d.nearestBuiDir, ".env") : undefined,
    d?.nearestOpencodeDir ? resolve(d.nearestOpencodeDir, ".env") : undefined,
    d?.nearestOpencodeDir ? resolve(d.nearestOpencodeDir, "bui", ".env") : undefined,
    resolve(homeDir(), ".config", "opencode", "bui", ".env"),
    resolve(homeDir(), ".config", "opencode", "plugins", ".env"),
    resolve(process.cwd(), ".env"),
  ].filter((value): value is string => Boolean(value));

  for (const path of candidates) {
    loadDotenv({ path, override });
  }
}

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

async function resolveDefaultDbDir(discovery: ConfigDiscovery): Promise<string | undefined> {
  const localCandidate = discovery.nearestOpencodeDir
    ? basename(discovery.nearestOpencodeDir) === ".opencode"
      ? resolve(discovery.nearestOpencodeDir, "bui")
      : discovery.nearestOpencodeDir
    : undefined;

  if (localCandidate) {
    const localDbPath = resolve(localCandidate, "opencode-bui.db");
    if (await pathExists(localDbPath)) {
      return localCandidate;
    }
  }

  const globalBuiDir = resolve(homeDir(), ".config", "opencode", "bui");
  const globalDbPath = resolve(globalBuiDir, "opencode-bui.db");
  if (await pathExists(globalDbPath)) {
    return globalBuiDir;
  }

  return globalBuiDir;
}

function fromEnv(): LooseInput {
  const envAllowedUsersRaw = process.env.TELEGRAM_ALLOWED_USERS;
  const envAllowedUsersParsed = parseAllowedUsers(envAllowedUsersRaw);
  const envAllowedUsers = envAllowedUsersParsed ?? [];
  const envAllowedUserIds = envAllowedUsers.length > 0
    ? []
    : parseUserIds(process.env.TELEGRAM_ALLOWED_USER_IDS);

  return {
    opencodeBin: process.env.OPENCODE_BIN?.trim() || undefined,
    opencodeAttachUrl: process.env.OPENCODE_ATTACH_URL?.trim() || undefined,
    sessionIdleTimeoutSeconds: parseNumber(process.env.BUI_SESSION_IDLE_TIMEOUT_SECONDS),
    runtimeDir: process.env.BUI_RUNTIME_DIR?.trim() || undefined,
    dbPath: process.env.BUI_DB_PATH?.trim() || undefined,
    uploadDir: process.env.BUI_UPLOAD_DIR?.trim() || process.env.TELEGRAM_UPLOAD_DIR?.trim() || undefined,
    lockPath: process.env.BUI_LOCK_PATH?.trim() || undefined,
    bridges: {
      telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
        allowedUserIds: envAllowedUserIds,
        allowedUsers: envAllowedUsersParsed,
        sttCommand: process.env.TELEGRAM_STT_COMMAND?.trim() || process.env.TELEGRAM_STT_COMAND?.trim() || undefined,
        sttTimeoutMs: parseNumber(process.env.TELEGRAM_STT_TIMEOUT_MS),
        backlogStaleSeconds: parseNumber(process.env.TELEGRAM_BACKLOG_STALE_SECONDS),
        backlogBatchWindowMs: parseNumber(process.env.TELEGRAM_BACKLOG_BATCH_WINDOW_MS),
      },
      discord: {
        token: process.env.DISCORD_BOT_TOKEN?.trim() || undefined,
        applicationId: process.env.DISCORD_APPLICATION_ID?.trim() || undefined,
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

export function toFriendlyZodError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
  return `Malformed OpenCode BUI config:\n${details}`;
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
