import type { ConversationRef } from "../domain/bridge.types";

export type SessionMapping = {
  conversationKey: string;
  sessionId: string;
  cwd?: string;
};

export interface SessionStore {
  getSessionByConversation(conversation: ConversationRef): Promise<SessionMapping | undefined>;
  getConversationBySessionID(sessionId: string): Promise<ConversationRef | undefined>;
  setSessionForConversation(conversation: ConversationRef, sessionId: string, cwd?: string): Promise<void>;
  clearSessionForConversation(conversation: ConversationRef): Promise<void>;
  setSessionCwd(sessionId: string, cwd: string): Promise<void>;
  getSessionCwd(sessionId: string): Promise<string | undefined>;
}
