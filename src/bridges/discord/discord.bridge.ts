import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import type { RuntimeConfig } from "@infra/config/config";
import type { BridgeAdapter, BridgeCommandDescriptor, BridgeRuntimeHandlers } from "@core/ports/bridge-adapter.types";
import type { OutboundEnvelope } from "@core/domain/envelope.types";
import { encodeBridgeButtonPayload } from "@common/bridge-buttons.utils";
import { logger } from "@infra/runtime/logger";

export type DiscordCommandRestClient = {
  put: (route: `/${string}`, options: { body: unknown }) => Promise<unknown>;
};

export type DiscordCommandRoutes = {
  applicationCommands: (applicationId: string) => `/${string}`;
  applicationGuildCommands: (applicationId: string, guildId: string) => `/${string}`;
};

function toConversation(channelId: string, threadId?: string) {
  return {
    bridgeId: "discord" as const,
    channelId,
    ...(threadId ? { threadId } : {}),
  };
}

function toChannel(input: { id: string; kind: "dm" | "group" | "thread" | "guild-channel" | "unknown"; title?: string }) {
  return {
    id: input.id,
    kind: input.kind,
    ...(input.title ? { title: input.title } : {}),
  };
}

function toUser(input: { id: string; username?: string; displayName?: string }) {
  return {
    id: input.id,
    ...(input.username ? { username: input.username } : {}),
    ...(input.displayName ? { displayName: input.displayName } : {}),
  };
}

function channelKind(channel: TextBasedChannel): "dm" | "group" | "thread" | "guild-channel" | "unknown" {
  if (channel.isDMBased()) {
    return "dm";
  }
  if (channel.isThread()) {
    return "thread";
  }
  if (channel.isTextBased()) {
    return "guild-channel";
  }
  return "unknown";
}

export async function registerDiscordCommands(
  config: RuntimeConfig,
  commands: BridgeCommandDescriptor[],
  restClient: DiscordCommandRestClient,
  routes: DiscordCommandRoutes,
): Promise<void> {
  if (config.bridges.discord.commandSyncMode !== "on-start") {
    return;
  }

  const body = commands.map((command) =>
    new SlashCommandBuilder().setName(command.command).setDescription(command.description.slice(0, 100)).toJSON(),
  );

  if (config.bridges.discord.guildScope === "guild" && config.bridges.discord.defaultGuildId) {
    await restClient.put(routes.applicationGuildCommands(config.bridges.discord.applicationId, config.bridges.discord.defaultGuildId), {
      body,
    });
    return;
  }

  await restClient.put(routes.applicationCommands(config.bridges.discord.applicationId), {
    body,
  });
}

export async function createDiscordBridge(config: RuntimeConfig): Promise<BridgeAdapter> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
  });

  const rest = new REST({ version: "10" }).setToken(config.bridges.discord.token);
  let handlers: BridgeRuntimeHandlers | undefined;
  let started = false;
  const typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  const typingKey = (conversation: { bridgeId: string; channelId: string; threadId?: string }) =>
    `${conversation.bridgeId}:${conversation.channelId}:${conversation.threadId || ""}`;

  const adapter: BridgeAdapter = {
    id: "discord",
    capabilities: {
      slashCommands: true,
      buttons: true,
      mediaUpload: true,
      mediaDownload: true,
      messageEdit: true,
      threads: true,
      markdown: "rich",
    },
    async start(nextHandlers) {
      handlers = nextHandlers;
      const dispatchInbound = (envelope: Parameters<BridgeRuntimeHandlers["onInbound"]>[0]) => {
        if (!handlers) {
          return;
        }
        void handlers.onInbound(envelope).catch((error) => {
          logger.error({ error, bridgeId: "discord", eventType: envelope.event.type }, "[bui] Failed to process inbound discord event.");
        });
      };
      if (started) {
        return;
      }
      logger.info("[bui] Discord bridge initializing event handlers.");

      client.on(Events.MessageCreate, async (message) => {
        if (!handlers || message.author.bot || !message.channel.isTextBased()) {
          return;
        }

        logger.info({ userId: message.author.id, channelId: message.channel.id }, "[bui] Discord message intercepted.");

        const baseEnvelope = {
          bridgeId: "discord" as const,
          conversation: toConversation(message.channel.id, message.channel.isThread() ? message.channel.id : undefined),
          channel: toChannel({
            id: message.channel.id,
            kind: channelKind(message.channel),
            ...("name" in message.channel && message.channel.name ? { title: message.channel.name } : {}),
          }),
          user: toUser({
            id: message.author.id,
            username: message.author.username,
            ...(message.member?.displayName ? { displayName: message.member.displayName } : {}),
          }),
          receivedAtUnixSeconds: Math.floor(message.createdTimestamp / 1000),
          raw: message,
        };

        for (const attachment of message.attachments.values()) {
          logger.info({ userId: message.author.id, channelId: message.channel.id, url: attachment.url }, "[bui] Discord attachment intercepted.");
          const mediaKind = attachment.contentType?.startsWith("image/")
            ? "image"
            : attachment.contentType?.startsWith("audio/")
              ? "audio"
              : attachment.contentType?.startsWith("video/")
                ? "video"
                : "document";

          dispatchInbound({
            ...baseEnvelope,
            event: {
              type: "media",
              mediaKind,
              fileId: attachment.url,
              ...(attachment.name ? { fileName: attachment.name } : {}),
              ...(attachment.contentType ? { mimeType: attachment.contentType } : {}),
              ...(message.content ? { caption: message.content } : {}),
            },
          });
        }

        if (!message.content.trim()) {
          return;
        }

        dispatchInbound({
          ...baseEnvelope,
          event: message.content.trim().startsWith("/")
            ? {
                type: "slash",
                command: message.content.trim().slice(1).split(/\s+/, 1)[0]?.toLowerCase() || "",
                args: message.content.trim().slice(1).split(/\s+/).slice(1).join(" "),
                raw: message.content,
              }
            : {
                type: "text",
                text: message.content,
              },
        });
      });

      client.on(Events.InteractionCreate, async (interaction) => {
        if (!handlers) {
          return;
        }

        if (interaction.isChatInputCommand()) {
          logger.info({ userId: interaction.user.id, command: interaction.commandName }, "[bui] Discord slash interaction intercepted.");
          const args = interaction.options.data
            .map((option) => `${option.name}:${String(option.value ?? "")}`)
            .join(" ");

          dispatchInbound({
            bridgeId: "discord",
            conversation: toConversation(interaction.channelId, interaction.channel?.isThread() ? interaction.channel.id : undefined),
            channel: toChannel({
              id: interaction.channelId,
              kind: interaction.channel && interaction.channel.isTextBased() ? channelKind(interaction.channel) : "unknown",
            }),
            user: toUser({
              id: interaction.user.id,
              username: interaction.user.username,
              ...(interaction.member && "nickname" in interaction.member && interaction.member.nickname
                ? { displayName: interaction.member.nickname }
                : {}),
            }),
            receivedAtUnixSeconds: Math.floor(Date.now() / 1000),
            event: {
              type: "slash",
              command: interaction.commandName,
              args,
              raw: `/${interaction.commandName} ${args}`,
            },
            raw: interaction,
          });

          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "Processing...", ephemeral: true });
          }
          return;
        }

        if (interaction.isButton()) {
          logger.info({ userId: interaction.user.id, customId: interaction.customId }, "[bui] Discord button interaction intercepted.");
          dispatchInbound({
            bridgeId: "discord",
            conversation: toConversation(interaction.channelId, interaction.channel?.isThread() ? interaction.channel.id : undefined),
            channel: toChannel({
              id: interaction.channelId,
              kind: interaction.channel && interaction.channel.isTextBased() ? channelKind(interaction.channel) : "unknown",
            }),
            user: toUser({ id: interaction.user.id, username: interaction.user.username }),
            receivedAtUnixSeconds: Math.floor(Date.now() / 1000),
            event: {
              type: "button",
              actionId: interaction.customId,
            },
            raw: interaction,
          });
          await interaction.reply({ content: "Received", ephemeral: true });
        }
      });

      await client.login(config.bridges.discord.token);
      started = true;
      logger.info("[bui] Discord bridge logged in.");
    },
    async stop() {
      for (const timer of typingIntervals.values()) {
        clearInterval(timer);
      }
      typingIntervals.clear();
      if (started) {
        await client.destroy();
      }
      started = false;
    },
    async send(envelope: OutboundEnvelope) {
      const channel = await client.channels.fetch(envelope.conversation.channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error(`Discord channel not found or not text-based: ${envelope.conversation.channelId}`);
      }
      if (!("send" in channel) || typeof channel.send !== "function") {
        throw new Error(`Discord channel does not support send: ${envelope.conversation.channelId}`);
      }

      const files = (envelope.attachments || []).map((item) => new AttachmentBuilder(item.filePath));
      const rows = (envelope.buttons || []).map((row) =>
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          row.map((button) =>
            new ButtonBuilder()
              .setCustomId(encodeBridgeButtonPayload(button.id, button.value))
              .setLabel(button.label)
              .setStyle(ButtonStyle.Secondary),
          ),
        ),
      );

      const chunks = envelope.chunks && envelope.chunks.length > 0 ? envelope.chunks : envelope.text ? [envelope.text] : [""];
      for (const [idx, chunk] of chunks.entries()) {
        const payload = {
          ...(chunk ? { content: chunk } : {}),
          ...(idx === 0 && files.length > 0 ? { files } : {}),
          ...(rows.length > 0 ? { components: rows } : {}),
        };
        await channel.send(payload);
      }
    },
    async beginTyping(conversation) {
      const channel = await client.channels.fetch(conversation.channelId);
      if (!channel || !channel.isTextBased() || !("sendTyping" in channel) || typeof channel.sendTyping !== "function") {
        throw new Error(`Discord channel does not support typing indicator: ${conversation.channelId}`);
      }

      const key = typingKey(conversation);
      const sendTyping = async () => {
        try {
          await channel.sendTyping();
        } catch (error) {
          logger.warn({ error, channelId: conversation.channelId }, "[bui] Discord typing action failed.");
        }
      };

      await sendTyping();
      const interval = setInterval(() => {
        void sendTyping();
      }, 7000);
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
      const channel = await client.channels.fetch(input.conversation.channelId);
      if (!channel || !channel.isTextBased() || !("send" in channel) || typeof channel.send !== "function") {
        throw new Error(`Discord channel not found or not text-based: ${input.conversation.channelId}`);
      }

      if (input.token) {
        try {
          const existing = await channel.messages.fetch(input.token);
          await existing.edit({ content: input.text });
          return existing.id;
        } catch {
          // Fallback to posting a new message.
        }
      }

      const sent = await channel.send({ content: input.text });
      return (sent as Message).id;
    },
    async downloadMedia(envelope) {
      const response = await fetch(envelope.event.fileId);
      if (!response.ok) {
        throw new Error(`Discord media download failed: HTTP ${response.status}`);
      }
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        ...(envelope.event.fileName ? { fileNameHint: envelope.event.fileName } : {}),
        ...(envelope.event.mimeType ? { mimeType: envelope.event.mimeType } : {}),
      };
    },
    async setCommands(commands: BridgeCommandDescriptor[]) {
      await registerDiscordCommands(config, commands, rest, Routes);
    },
    async health() {
      return {
        bridgeId: "discord",
        status: started ? "ready" : "stopped",
      };
    },
  };

  return adapter;
}
