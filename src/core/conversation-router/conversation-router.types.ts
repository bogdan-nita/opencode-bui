import type { ConversationRef } from "@bridge/types";

export type ConversationRoute = {
  conversation: ConversationRef;
  sessionId?: string;
  cwd?: string;
};
