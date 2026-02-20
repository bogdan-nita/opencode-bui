import type { RuntimeConfig } from "@config/config.types";

/**
 * Checks if a user is allowed to interact with the Telegram bot
 * based on the allowlist configuration.
 */
export function isUserAllowed(config: RuntimeConfig, userId: number, username: string | undefined): boolean {
  const allowlist = config.bridges.telegram.allowedUsers;
  if (allowlist.ids.size === 0 && allowlist.usernames.size === 0) {
    return true;
  }
  if (allowlist.ids.has(userId)) {
    return true;
  }

  const normalizedUsername = username?.trim().replace(/^@+/, "").toLowerCase();
  return normalizedUsername ? allowlist.usernames.has(normalizedUsername) : false;
}
