import type { Bot } from "grammy";
import type { BridgeRuntimeHandlers } from "@bridge/bridge-adapter.types";
import { logger } from "@runtime/logger";
import { isUserAllowed } from "../middleware/permissions";
import type { RuntimeConfig } from "@config/config.types";

/**
 * Registers the photo message handler on the bot.
 */
export function registerPhotoMessageHandler(
  bot: Bot,
  config: RuntimeConfig,
  getHandlers: () => BridgeRuntimeHandlers | undefined,
): void {
  bot.on("message:photo", async (ctx) => {
    const handlers = getHandlers();
    if (!handlers) {
      return;
    }
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }
    if (!isUserAllowed(config, userId, ctx.from?.username)) {
      logger.warn({ userId, username: ctx.from?.username }, "[bui] Telegram media blocked by allowlist.");
      return;
    }
    logger.info({ userId, username: ctx.from?.username, chatId: ctx.chat.id }, "[bui] Telegram photo intercepted.");
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    if (!largest) {
      return;
    }

    await handlers.onInbound({
      bridgeId: "telegram",
      conversation: { bridgeId: "telegram", channelId: String(ctx.chat.id) },
      channel: { id: String(ctx.chat.id), kind: "dm" },
      user: { id: String(userId), ...(ctx.from?.username ? { username: ctx.from.username } : {}) },
      receivedAtUnixSeconds: ctx.message.date,
      event: {
        type: "media",
        mediaKind: "image",
        fileId: largest.file_id,
        fileName: `${largest.file_unique_id}.jpg`,
      },
    });
  });
}
