import type { Message } from "discord.js";
import type { BridgeRuntimeHandlers } from "@bridge/bridge-adapter.types";
import { logger } from "@runtime/logger";
import { toConversation, toChannel, toUser, channelKind } from "../discord.utils";

/**
 * Handles Discord MessageCreate events and forwards them to the runtime handlers.
 */
export async function handleMessageCreate(
  message: Message,
  handlers: BridgeRuntimeHandlers,
): Promise<void> {
  if (message.author.bot || !message.channel.isTextBased()) {
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

  // Handle attachments
  for (const attachment of message.attachments.values()) {
    logger.info({ userId: message.author.id, channelId: message.channel.id, url: attachment.url }, "[bui] Discord attachment intercepted.");
    const mediaKind = attachment.contentType?.startsWith("image/")
      ? "image"
      : attachment.contentType?.startsWith("audio/")
        ? "audio"
        : attachment.contentType?.startsWith("video/")
          ? "video"
          : "document";

    await handlers.onInbound({
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

  // Handle text content
  if (!message.content.trim()) {
    return;
  }

  await handlers.onInbound({
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
}
