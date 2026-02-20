import { basename } from "node:path";
import type { Bot } from "grammy";
import { logger } from "@infra/logger";

/**
 * Generates a unique key for typing indicators based on conversation identifiers.
 */
export function conversationTypingKey(conversation: { bridgeId: string; channelId: string; threadId?: string }): string {
  return `${conversation.bridgeId}:${conversation.channelId}:${conversation.threadId || ""}`;
}

/**
 * Downloads a file from Telegram by file ID.
 */
export async function downloadTelegramFile(
  bot: Bot,
  token: string,
  fileId: string,
): Promise<{ bytes: Uint8Array; fileNameHint?: string }> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Telegram did not return file_path for media download.");
  }
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Telegram file download failed: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    bytes,
    ...(file.file_path ? { fileNameHint: basename(file.file_path) } : {}),
  };
}

/**
 * Safely answers a callback query, handling potential errors from stale button taps.
 */
export async function safeAnswerCallbackQuery(
  ctx: { answerCallbackQuery: (options?: { text?: string; show_alert?: boolean; cache_time?: number }) => Promise<unknown> },
  text = "Received",
): Promise<void> {
  try {
    await ctx.answerCallbackQuery({ text, cache_time: 1 });
  } catch (error) {
    logger.warn({ error }, "[bui] Telegram answerCallbackQuery failed (likely stale button tap).");
  }
}
