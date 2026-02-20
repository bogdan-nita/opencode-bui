import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agentTemplatesTable = sqliteTable("agent_templates", {
  name: text("name").primaryKey(),
  template: text("template").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
