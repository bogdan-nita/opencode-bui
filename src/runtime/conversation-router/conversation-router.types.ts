import type { ConversationRef } from "@runtime/bridge/types";

export type ConversationRoute = {
  conversation: ConversationRef;
  sessionId?: string;
  cwd?: string;
};
