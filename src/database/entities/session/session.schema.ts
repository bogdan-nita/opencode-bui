import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversationSessionsTable = sqliteTable("conversation_sessions", {
  conversationKey: text("conversation_key").primaryKey(),
  bridgeId: text("bridge_id").notNull(),
  channelId: text("channel_id").notNull(),
  threadId: text("thread_id"),
  sessionId: text("session_id").notNull(),
  cwd: text("cwd"),
  updatedAt: text("updated_at").notNull(),
});

export const sessionWorkdirsTable = sqliteTable("session_workdirs", {
  sessionId: text("session_id").primaryKey(),
  cwd: text("cwd").notNull(),
  updatedAt: text("updated_at").notNull(),
});
