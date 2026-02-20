import type { Bot } from "grammy";
import type { BridgeRuntimeHandlers } from "../../../types/bridge-adapter.types";
import { logger } from "@infra/logger";
import { isUserAllowed } from "../middleware/permissions";
import type { RuntimeConfig } from "@config/config.types";

/**
 * Registers the audio message handler on the bot.
 */
export function registerAudioMessageHandler(
  bot: Bot,
  config: RuntimeConfig,
  getHandlers: () => BridgeRuntimeHandlers | undefined,
): void {
  bot.on("message:audio", async (ctx) => {
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
    const audio = ctx.message.audio;
    if (!audio) {
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
        mediaKind: "audio",
        fileId: audio.file_id,
        ...(audio.file_name ? { fileName: audio.file_name } : {}),
        ...(audio.mime_type ? { mimeType: audio.mime_type } : {}),
        ...(ctx.message.caption ? { caption: ctx.message.caption } : {}),
      },
    });
  });
}
