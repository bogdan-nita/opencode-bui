import { Bot } from "grammy";
import { basename } from "node:path";
import type { RuntimeConfig } from "@infra/config/config.types.js";
import type { BridgeAdapter, BridgeCommandDescriptor, BridgeRuntimeHandlers } from "@core/ports/bridge-adapter.types.js";
import type { OutboundEnvelope } from "@core/domain/envelope.types.js";
import { buildTextInbound, sendOutboundViaTelegram } from "./telegram.utils.js";
import { logger } from "@infra/runtime/logger.utils.js";

function isUserAllowed(config: RuntimeConfig, userId: number, username: string | undefined): boolean {
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

  const conversationTypingKey = (conversation: { bridgeId: string; channelId: string; threadId?: string }): string =>
    `${conversation.bridgeId}:${conversation.channelId}:${conversation.threadId || ""}`;

  const downloadTelegramFile = async (fileId: string): Promise<{ bytes: Uint8Array; fileNameHint?: string }> => {
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
  };

  const safeAnswerCallbackQuery = async (
    ctx: { answerCallbackQuery: (options?: { text?: string; show_alert?: boolean; cache_time?: number }) => Promise<unknown> },
    text = "Received",
  ): Promise<void> => {
    try {
      await ctx.answerCallbackQuery({ text, cache_time: 1 });
    } catch (error) {
      logger.warn({ error }, "[bui] Telegram answerCallbackQuery failed (likely stale button tap).");
    }
  };

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
      const dispatchInbound = (envelope: Parameters<BridgeRuntimeHandlers["onInbound"]>[0]) => {
        if (!handlers) {
          return;
        }
        void handlers.onInbound(envelope).catch((error) => {
          logger.error({ error, bridgeId: "telegram", eventType: envelope.event.type }, "[bui] Failed to process inbound telegram event.");
        });
      };
      if (started) {
        return;
      }
      logger.info("[bui] Telegram bridge initializing polling handlers.");
      bot.catch((error) => {
        logger.error({ error }, "[bui] Telegram middleware error.");
      });

      bot.on("message:text", async (ctx) => {
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

        dispatchInbound(
          buildTextInbound({
            chatId: ctx.chat.id,
            userId,
            ...(ctx.from?.username ? { username: ctx.from.username } : {}),
            text: ctx.message.text,
            unixSeconds: ctx.message.date,
          }),
        );
      });

      bot.on("message:photo", async (ctx) => {
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

        dispatchInbound({
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

      bot.on("message:document", async (ctx) => {
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

        dispatchInbound({
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

      bot.on("message:video", async (ctx) => {
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

        dispatchInbound({
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

      bot.on("message:audio", async (ctx) => {
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

        dispatchInbound({
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

      bot.on("callback_query:data", async (ctx) => {
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
        dispatchInbound({
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
      const result = await downloadTelegramFile(envelope.event.fileId);
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
