import type { ConversationRef } from "@bridge/types";

export function conversationKey(conversation: ConversationRef): string {
  return `${conversation.bridgeId}:${conversation.channelId}${conversation.threadId ? `:${conversation.threadId}` : ""}`;
}

export type { ConversationRoute } from "./conversation-router.types";
