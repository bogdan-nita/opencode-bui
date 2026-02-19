import type { ConversationRef } from "../domain/bridge.types.js";

export function conversationKey(conversation: ConversationRef): string {
  return `${conversation.bridgeId}:${conversation.channelId}${conversation.threadId ? `:${conversation.threadId}` : ""}`;
}
