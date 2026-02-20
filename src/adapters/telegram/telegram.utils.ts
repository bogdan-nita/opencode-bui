import { InlineKeyboard, InputFile, type Bot } from "grammy";
import { splitLongText } from "@bridge/bridge.utils";
import type { InboundEnvelope, OutboundEnvelope } from "@bridge/envelope.types";
import { logger } from "@runtime/logger";

export function createConversation(channelId: string) {
  return {
    bridgeId: "telegram" as const,
    channelId,
  };
}

export async function sendOutboundViaTelegram(bot: Bot, envelope: OutboundEnvelope, maxChunkChars: number): Promise<void> {
  const chatId = Number.parseInt(envelope.conversation.channelId, 10);
  if (!Number.isFinite(chatId)) {
    throw new Error(`Invalid Telegram chat id: ${envelope.conversation.channelId}`);
  }

  const chunks = envelope.chunks?.length ? envelope.chunks : envelope.text ? splitLongText(envelope.text, maxChunkChars) : [];
  logger.info({ chatId, chunkCount: chunks.length, attachmentCount: envelope.attachments?.length ?? 0, buttonRows: envelope.buttons?.length ?? 0 }, "[bui] Telegram outbound dispatch started.");
  for (const chunk of chunks) {
    logger.info({ chatId, chunkChars: chunk.length }, "[bui] Telegram sending text chunk.");
    await bot.api.sendMessage(chatId, chunk, { link_preview_options: { is_disabled: true } });
  }

  if (envelope.buttons && envelope.buttons.length > 0) {
    logger.info(
      {
        chatId,
        buttonRows: envelope.buttons.length,
        buttonPayloads: envelope.buttons.map((row) => row.map((button) => `bui:${button.id}:${button.value || ""}`)),
      },
      "[bui] Telegram sending inline keyboard.",
    );
    const keyboard = new InlineKeyboard();
    for (const row of envelope.buttons) {
      row.forEach((button, idx) => {
        keyboard.text(button.label, `bui:${button.id}:${button.value || ""}`);
        if (idx < row.length - 1) {
          return;
        }
      });
      keyboard.row();
    }
    await bot.api.sendMessage(chatId, "Select an option:", { reply_markup: keyboard });
  }

  for (const attachment of envelope.attachments || []) {
    if (attachment.kind === "image") {
      try {
        await bot.api.sendPhoto(chatId, new InputFile(attachment.filePath), attachment.caption ? { caption: attachment.caption } : undefined);
      } catch (error) {
        logger.warn({ error, filePath: attachment.filePath }, "[bui] sendPhoto failed, retrying as document.");
        await bot.api.sendDocument(chatId, new InputFile(attachment.filePath), attachment.caption ? { caption: attachment.caption } : undefined);
      }
      continue;
    }
    await bot.api.sendDocument(chatId, new InputFile(attachment.filePath), attachment.caption ? { caption: attachment.caption } : undefined);
  }
  logger.info({ chatId }, "[bui] Telegram outbound dispatch completed.");
}

export function buildTextInbound(input: {
  chatId: number;
  userId: number;
  username?: string;
  text: string;
  unixSeconds: number;
}): InboundEnvelope {
  return {
    bridgeId: "telegram",
    conversation: createConversation(String(input.chatId)),
    channel: {
      id: String(input.chatId),
      kind: "dm",
    },
    user: {
      id: String(input.userId),
      ...(input.username ? { username: input.username } : {}),
    },
    receivedAtUnixSeconds: input.unixSeconds,
    event: input.text.trim().startsWith("/")
      ? {
          type: "slash",
          command: input.text.trim().slice(1).split(/\s+/, 1)[0]?.toLowerCase() || "",
          args: input.text.trim().slice(1).split(/\s+/).slice(1).join(" "),
          raw: input.text,
        }
      : {
          type: "text",
          text: input.text,
        },
  };
}
