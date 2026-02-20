import type { ConversationRef } from "@bridge/bridge.types";

export type ConversationRoute = {
  conversation: ConversationRef;
  sessionId?: string;
  cwd?: string;
};
