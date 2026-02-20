import type { Bot } from "grammy";
import type { BridgeRuntimeHandlers } from "../../../types/bridge-adapter.types";
import { buildTextInbound } from "../telegram.utils";
import { logger } from "@runtime/logger";
import { isUserAllowed } from "../middleware/permissions";
import type { RuntimeConfig } from "@config/config.types";

/**
 * Registers the text message handler on the bot.
 */
export function registerTextMessageHandler(
  bot: Bot,
  config: RuntimeConfig,
  getHandlers: () => BridgeRuntimeHandlers | undefined,
): void {
  bot.on("message:text", async (ctx) => {
    const handlers = getHandlers();
    if (!handlers) {
      return;
    }
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    if (!isUserAllowed(config, userId, ctx.from?.username)) {
      logger.warn({ userId, username: ctx.from?.username }, "[bui] Telegram message blocked by allowlist.");
      await ctx.reply("You are not allowed to use this bot.");
      return;
    }

    logger.info({ userId, username: ctx.from?.username, chatId: ctx.chat.id }, "[bui] Telegram text message intercepted.");

    await handlers.onInbound(
      buildTextInbound({
        chatId: ctx.chat.id,
        userId,
        ...(ctx.from?.username ? { username: ctx.from.username } : {}),
        text: ctx.message.text,
        unixSeconds: ctx.message.date,
      }),
    );
  });
}
