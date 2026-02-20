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

export const agentTemplatesTable = sqliteTable("agent_templates", {
  name: text("name").primaryKey(),
  template: text("template").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const permissionRequestsTable = sqliteTable("permission_requests", {
  permissionId: text("permission_id").primaryKey(),
  conversationKey: text("conversation_key").notNull(),
  requesterUserId: text("requester_user_id").notNull(),
  status: text("status").notNull(),
  response: text("response"),
  expiresAtUnixSeconds: text("expires_at_unix_seconds").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
