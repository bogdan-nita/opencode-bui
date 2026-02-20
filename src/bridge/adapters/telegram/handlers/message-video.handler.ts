import type { Bot } from "grammy";
import type { BridgeRuntimeHandlers } from "../../../types/bridge-adapter.types";
import { logger } from "@infra/logger";
import { isUserAllowed } from "../middleware/permissions";
import type { RuntimeConfig } from "@config/config.types";

/**
 * Registers the video message handler on the bot.
 */
export function registerVideoMessageHandler(
  bot: Bot,
  config: RuntimeConfig,
  getHandlers: () => BridgeRuntimeHandlers | undefined,
): void {
  bot.on("message:video", async (ctx) => {
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
    const video = ctx.message.video;
    if (!video) {
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
        mediaKind: "video",
        fileId: video.file_id,
        ...(video.mime_type ? { mimeType: video.mime_type } : {}),
        ...(ctx.message.caption ? { caption: ctx.message.caption } : {}),
      },
    });
  });
}
