import type { Bot } from "grammy";
import type { BridgeRuntimeHandlers } from "@bridge/bridge-adapter.types";
import { logger } from "@runtime/logger";
import { isUserAllowed } from "../middleware/permissions";
import type { RuntimeConfig } from "@config/config.types";

/**
 * Safely answers a callback query, handling potential errors from stale button taps.
 */
async function safeAnswerCallbackQuery(
  ctx: { answerCallbackQuery: (options?: { text?: string; show_alert?: boolean; cache_time?: number }) => Promise<unknown> },
  text = "Received",
): Promise<void> {
  try {
    await ctx.answerCallbackQuery({ text, cache_time: 1 });
  } catch (error) {
    logger.warn({ error }, "[bui] Telegram answerCallbackQuery failed (likely stale button tap).");
  }
}

/**
 * Registers the callback query handler on the bot.
 */
export function registerCallbackQueryHandler(
  bot: Bot,
  config: RuntimeConfig,
  getHandlers: () => BridgeRuntimeHandlers | undefined,
): void {
  bot.on("callback_query:data", async (ctx) => {
    const handlers = getHandlers();
    if (!handlers) {
      return;
    }
    const userId = ctx.from?.id;
    const chatId = ctx.callbackQuery.message?.chat.id;
    if (!userId) {
      await safeAnswerCallbackQuery(ctx, "Invalid user");
      return;
    }
    if (!chatId) {
      await safeAnswerCallbackQuery(ctx, "Invalid chat");
      return;
    }
    if (!isUserAllowed(config, userId, ctx.from?.username)) {
      logger.warn({ userId, username: ctx.from?.username }, "[bui] Telegram callback blocked by allowlist.");
      await safeAnswerCallbackQuery(ctx, "Not allowed");
      return;
    }
    logger.info(
      {
        userId,
        username: ctx.from?.username,
        chatId,
        data: ctx.callbackQuery.data,
        callbackQueryId: ctx.callbackQuery.id,
        messageDate: ctx.callbackQuery.message?.date,
      },
      "[bui] Telegram callback intercepted.",
    );
    await safeAnswerCallbackQuery(ctx, "Processing...");
    await handlers.onInbound({
      bridgeId: "telegram",
      conversation: { bridgeId: "telegram", channelId: String(chatId) },
      channel: { id: String(chatId), kind: "dm" },
      user: { id: String(userId), ...(ctx.from?.username ? { username: ctx.from.username } : {}) },
      receivedAtUnixSeconds: Math.floor(Date.now() / 1000),
      event: {
        type: "button",
        actionId: ctx.callbackQuery.data,
      },
      raw: ctx.callbackQuery,
    });
  });
}
