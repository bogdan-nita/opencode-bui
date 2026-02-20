import type { ConversationRef } from "../../domain/bridge.types";

export type ConversationRoute = {
  conversation: ConversationRef;
  sessionId?: string;
  cwd?: string;
};
