import { sqliteTable, text } from "drizzle-orm/sqlite-core";

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
