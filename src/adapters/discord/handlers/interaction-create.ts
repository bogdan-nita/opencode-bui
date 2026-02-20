import type { Interaction, ChatInputCommandInteraction, ButtonInteraction } from "discord.js";
import type { BridgeRuntimeHandlers } from "@bridge/bridge-adapter.types";
import { logger } from "@runtime/logger";
import { toConversation, toChannel, toUser, channelKind } from "../discord.utils";

/**
 * Handles Discord InteractionCreate events (slash commands and button clicks).
 */
export async function handleInteractionCreate(
  interaction: Interaction,
  handlers: BridgeRuntimeHandlers,
): Promise<void> {
  if (interaction.isChatInputCommand()) {
    await handleChatInputCommand(interaction, handlers);
    return;
  }

  if (interaction.isButton()) {
    await handleButtonInteraction(interaction, handlers);
    return;
  }
}

async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  handlers: BridgeRuntimeHandlers,
): Promise<void> {
  logger.info({ userId: interaction.user.id, command: interaction.commandName }, "[bui] Discord slash interaction intercepted.");
  
  const args = interaction.options.data
    .map((option) => `${option.name}:${String(option.value ?? "")}`)
    .join(" ");

  await handlers.onInbound({
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
}

async function handleButtonInteraction(
  interaction: ButtonInteraction,
  handlers: BridgeRuntimeHandlers,
): Promise<void> {
  logger.info({ userId: interaction.user.id, customId: interaction.customId }, "[bui] Discord button interaction intercepted.");
  
  await handlers.onInbound({
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
