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
} from "discord.js";
import type { RuntimeConfig } from "@config/config.types";
import type { BridgeAdapter, BridgeCommandDescriptor, BridgeRuntimeHandlers } from "../../types/bridge-adapter.types";
import type { OutboundEnvelope } from "../../types/envelope.types";
import type { DiscordCommandRestClient, DiscordCommandRoutes } from "./discord.types";
import { logger } from "@infra/logger";
import { handleMessageCreate } from "./handlers/message-create";
import { handleInteractionCreate } from "./handlers/interaction-create";
import { createTypingManager } from "./middleware/typing";

export type { DiscordCommandRestClient, DiscordCommandRoutes } from "./discord.types";

/**
 * Registers Discord slash commands with the Discord API.
 */
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

/**
 * Creates the Discord bridge adapter.
 */
export async function createDiscordBridge(config: RuntimeConfig): Promise<BridgeAdapter> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
  });

  const rest = new REST({ version: "10" }).setToken(config.bridges.discord.token);
  const typingManager = createTypingManager(client);
  let handlers: BridgeRuntimeHandlers | undefined;
  let started = false;

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
      if (started) {
        return;
      }
      logger.info("[bui] Discord bridge initializing event handlers.");

      // Register message handler
      client.on(Events.MessageCreate, async (message) => {
        if (!handlers) {
          return;
        }
        await handleMessageCreate(message, handlers);
      });

      // Register interaction handler
      client.on(Events.InteractionCreate, async (interaction) => {
        if (!handlers) {
          return;
        }
        await handleInteractionCreate(interaction, handlers);
      });

      await client.login(config.bridges.discord.token);
      started = true;
      logger.info("[bui] Discord bridge logged in.");
    },

    async stop() {
      typingManager.stopAll();
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
              .setCustomId(`bui:${button.id}:${button.value || ""}`)
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
      return typingManager.beginTyping(conversation);
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
