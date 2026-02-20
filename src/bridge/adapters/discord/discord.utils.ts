import type { OutboundEnvelope } from "../../types/envelope.types";
import type { TextBasedChannel } from "discord.js";

export function renderDiscordNotImplementedEnvelope(envelope: OutboundEnvelope): string {
  const text = envelope.text || envelope.chunks?.join("\n") || "";
  return `Discord bridge not implemented yet. Requested send: ${text.slice(0, 120)}`;
}

export function toConversation(channelId: string, threadId?: string) {
  return {
    bridgeId: "discord" as const,
    channelId,
    ...(threadId ? { threadId } : {}),
  };
}

export function toChannel(input: { id: string; kind: "dm" | "group" | "thread" | "guild-channel" | "unknown"; title?: string }) {
  return {
    id: input.id,
    kind: input.kind,
    ...(input.title ? { title: input.title } : {}),
  };
}

export function toUser(input: { id: string; username?: string; displayName?: string }) {
  return {
    id: input.id,
    ...(input.username ? { username: input.username } : {}),
    ...(input.displayName ? { displayName: input.displayName } : {}),
  };
}

export function channelKind(channel: TextBasedChannel): "dm" | "group" | "thread" | "guild-channel" | "unknown" {
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
