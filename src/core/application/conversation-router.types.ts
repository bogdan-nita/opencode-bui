import type { ConversationRef } from "../domain/bridge.types.js";

export type ConversationRoute = {
  conversation: ConversationRef;
  sessionId?: string;
  cwd?: string;
};
