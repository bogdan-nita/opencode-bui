import type { Bot } from "grammy";
import type { BridgeRuntimeHandlers } from "../../../types/bridge-adapter.types";
import { logger } from "@runtime/logger";
import { isUserAllowed } from "../middleware/permissions";
import type { RuntimeConfig } from "@config/config.types";

/**
 * Registers the document message handler on the bot.
 */
export function registerDocumentMessageHandler(
  bot: Bot,
  config: RuntimeConfig,
  getHandlers: () => BridgeRuntimeHandlers | undefined,
): void {
  bot.on("message:document", async (ctx) => {
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
    const document = ctx.message.document;
    if (!document) {
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
        mediaKind: "document",
        fileId: document.file_id,
        ...(document.file_name ? { fileName: document.file_name } : {}),
        ...(document.mime_type ? { mimeType: document.mime_type } : {}),
        ...(ctx.message.caption ? { caption: ctx.message.caption } : {}),
      },
    });
  });
}
