import { Bot } from "grammy";
import type { RuntimeConfig } from "@config/config.types";
import type { BridgeAdapter, BridgeCommandDescriptor, BridgeRuntimeHandlers } from "@bridge/bridge-adapter.types";
import type { OutboundEnvelope } from "@bridge/envelope.types";
import { sendOutboundViaTelegram } from "./telegram.utils";
import { conversationTypingKey, downloadTelegramFile } from "./telegram.helpers";
import { logger } from "@runtime/logger";
import { registerTextMessageHandler } from "./handlers/message-text.handler";
import { registerPhotoMessageHandler } from "./handlers/message-photo.handler";
import { registerDocumentMessageHandler } from "./handlers/message-document.handler";
import { registerVideoMessageHandler } from "./handlers/message-video.handler";
import { registerAudioMessageHandler } from "./handlers/message-audio.handler";
import { registerCallbackQueryHandler } from "./handlers/callback-query.handler";

export async function createTelegramBridge(config: RuntimeConfig): Promise<BridgeAdapter> {
  const token = config.bridges.telegram.token;
  if (!token) {
    throw new Error("Telegram token is missing.");
  }

  const bot = new Bot(token);
  let handlers: BridgeRuntimeHandlers | undefined;
  let started = false;
  let startError: string | undefined;
  const typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  const adapter: BridgeAdapter = {
    id: "telegram",
    capabilities: {
      slashCommands: true,
      buttons: true,
      mediaUpload: true,
      mediaDownload: true,
      messageEdit: true,
      threads: false,
      markdown: "limited",
    },
    async start(nextHandlers) {
      handlers = nextHandlers;
      if (started) {
        return;
      }
      logger.info("[bui] Telegram bridge initializing polling handlers.");
      bot.catch((error) => {
        logger.error({ error }, "[bui] Telegram middleware error.");
      });

      // Register all message handlers
      registerTextMessageHandler(bot, config, () => handlers);
      registerPhotoMessageHandler(bot, config, () => handlers);
      registerDocumentMessageHandler(bot, config, () => handlers);
      registerVideoMessageHandler(bot, config, () => handlers);
      registerAudioMessageHandler(bot, config, () => handlers);
      registerCallbackQueryHandler(bot, config, () => handlers);

      started = true;
      startError = undefined;
      void bot
        .start({ drop_pending_updates: config.bridges.telegram.polling.dropPendingUpdates })
        .then(() => {
          logger.info("[bui] Telegram polling started.");
        })
        .catch((error) => {
          startError = error instanceof Error ? error.message : String(error);
          logger.error({ error: startError }, "[bui] Telegram polling failed.");
          started = false;
        });
    },
    async stop() {
      for (const timer of typingIntervals.values()) {
        clearInterval(timer);
      }
      typingIntervals.clear();
      if (started) {
        bot.stop();
      }
      started = false;
    },
    async send(envelope: OutboundEnvelope) {
      await sendOutboundViaTelegram(bot, envelope, config.bridges.telegram.formatting.maxChunkChars);
    },
    async beginTyping(conversation) {
      const key = conversationTypingKey(conversation);
      const chatId = Number.parseInt(conversation.channelId, 10);
      if (!Number.isFinite(chatId)) {
        throw new Error(`Invalid Telegram chat id: ${conversation.channelId}`);
      }

      const sendTyping = async () => {
        try {
          await bot.api.sendChatAction(chatId, "typing");
        } catch (error) {
          logger.warn({ error, chatId }, "[bui] Telegram typing action failed.");
        }
      };

      await sendTyping();
      const interval = setInterval(() => {
        void sendTyping();
      }, 4000);
      typingIntervals.set(key, interval);

      return async () => {
        const existing = typingIntervals.get(key);
        if (existing) {
          clearInterval(existing);
          typingIntervals.delete(key);
        }
      };
    },
    async upsertActivityMessage(input) {
      const chatId = Number.parseInt(input.conversation.channelId, 10);
      if (!Number.isFinite(chatId)) {
        throw new Error(`Invalid Telegram chat id: ${input.conversation.channelId}`);
      }

      if (input.token) {
        const messageId = Number.parseInt(input.token, 10);
        if (Number.isFinite(messageId)) {
          try {
            await bot.api.editMessageText(chatId, messageId, input.text, {
              link_preview_options: { is_disabled: true },
            });
            return String(messageId);
          } catch (error) {
            logger.warn({ error, chatId, messageId }, "[bui] Failed to edit activity message, posting a new one.");
          }
        }
      }

      const sent = await bot.api.sendMessage(chatId, input.text, {
        link_preview_options: { is_disabled: true },
      });
      return String(sent.message_id);
    },
    async downloadMedia(envelope) {
      const result = await downloadTelegramFile(bot, token, envelope.event.fileId);
      return {
        bytes: result.bytes,
        ...(envelope.event.fileName || result.fileNameHint ? { fileNameHint: envelope.event.fileName || result.fileNameHint } : {}),
        ...(envelope.event.mimeType ? { mimeType: envelope.event.mimeType } : {}),
      };
    },
    async setCommands(commands: BridgeCommandDescriptor[]) {
      if (!config.bridges.telegram.commands.registerOnStart) {
        return;
      }
      await bot.api.setMyCommands(commands.map((entry) => ({ command: entry.command, description: entry.description })));
    },
    async health() {
      return {
        bridgeId: "telegram",
        status: startError ? "degraded" : started ? "ready" : "stopped",
        ...(startError ? { details: startError } : {}),
      };
    },
  };

  return adapter;
}
