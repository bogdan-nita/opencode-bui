import { eq } from "drizzle-orm";
import { formatISO } from "date-fns";
import { sortBy } from "remeda";
import type { AgentStore } from "@bridge/agent-store.types";
import { agentTemplatesTable } from "@database/db";
import type { RuntimeDB } from "@database/db";

function sanitizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-");
}

function nowIso(): string {
  return formatISO(new Date());
}

export function createLibsqlAgentStore(database: RuntimeDB): AgentStore {
  return {
    async list() {
      const rows = await database.db.select().from(agentTemplatesTable);
      return sortBy(rows, (row) => row.name).map((row) => ({
        name: row.name,
        template: row.template,
        createdAt: row.createdAt,
      }));
    },

    async save(name, template) {
      const safeName = sanitizeName(name);
      const timestamp = nowIso();

      await database.db
        .insert(agentTemplatesTable)
        .values({
          name: safeName,
          template: template.trim(),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: agentTemplatesTable.name,
          set: {
            template: template.trim(),
            updatedAt: timestamp,
          },
        });
    },

    async get(name) {
      const safeName = sanitizeName(name);
      const rows = await database.db
        .select()
        .from(agentTemplatesTable)
        .where(eq(agentTemplatesTable.name, safeName))
        .limit(1);

      const row = rows[0];
      if (!row) {
        return undefined;
      }

      return {
        name: row.name,
        template: row.template,
        createdAt: row.createdAt,
      };
    },
  };
}
