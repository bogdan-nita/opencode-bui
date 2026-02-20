import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { parseAllowedUsers, parseNumber, parseUserIds } from "./validation";
import type { ConfigDiscovery } from "./config.types";

type LooseInput = Record<string, unknown>;

export function loadEnvFiles(options?: { override?: boolean; discovery?: ConfigDiscovery }): void {
  const override = options?.override ?? true;
  const d = options?.discovery;
  const home = process.env.HOME ?? process.cwd();

  const candidates = [
    process.env.BUI_ENV_PATH,
    process.env.TELEGRAM_PLUGIN_ENV,
    d?.nearestBuiDir ? resolve(d.nearestBuiDir, ".env") : undefined,
    d?.nearestOpencodeDir ? resolve(d.nearestOpencodeDir, ".env") : undefined,
    d?.nearestOpencodeDir ? resolve(d.nearestOpencodeDir, "bui", ".env") : undefined,
    resolve(home, ".config", "opencode", "bui", ".env"),
    resolve(home, ".config", "opencode", "plugins", ".env"),
    resolve(process.cwd(), ".env"),
  ].filter((value): value is string => Boolean(value));

  for (const path of candidates) {
    loadDotenv({ path, override });
  }
}

export function fromEnv(): LooseInput {
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
