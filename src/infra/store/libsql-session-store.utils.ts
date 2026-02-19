import { eq } from "drizzle-orm";
import { formatISO } from "date-fns";
import type { ConversationRef } from "@core/domain/bridge.types.js";
import { conversationKey } from "@core/application/conversation-router.utils.js";
import type { SessionMapping, SessionStore } from "@core/ports/session-store.types.js";
import { conversationSessionsTable, sessionWorkdirsTable } from "@infra/db/db.schema.js";
import type { BuiDb } from "@infra/db/db.types.js";

function nowIso(): string {
  return formatISO(new Date());
}

export function createLibsqlSessionStore(database: BuiDb): SessionStore {
  return {
    async getSessionByConversation(conversation: ConversationRef): Promise<SessionMapping | undefined> {
      const key = conversationKey(conversation);
      const rows = await database.db
        .select()
        .from(conversationSessionsTable)
        .where(eq(conversationSessionsTable.conversationKey, key))
        .limit(1);

      const row = rows[0];
      if (!row) {
        return undefined;
      }

      return {
        conversationKey: key,
        sessionId: row.sessionId,
        ...(row.cwd ? { cwd: row.cwd } : {}),
      };
    },

    async getConversationBySessionId(sessionId: string): Promise<ConversationRef | undefined> {
      const rows = await database.db
        .select()
        .from(conversationSessionsTable)
        .where(eq(conversationSessionsTable.sessionId, sessionId))
        .limit(1);

      const row = rows[0];
      if (!row) {
        return undefined;
      }

      return {
        bridgeId: row.bridgeId as ConversationRef["bridgeId"],
        channelId: row.channelId,
        ...(row.threadId ? { threadId: row.threadId } : {}),
      };
    },

    async setSessionForConversation(conversation: ConversationRef, sessionId: string, cwd?: string): Promise<void> {
      const key = conversationKey(conversation);
      const timestamp = nowIso();

      await database.db
        .insert(conversationSessionsTable)
        .values({
          conversationKey: key,
          bridgeId: conversation.bridgeId,
          channelId: conversation.channelId,
          ...(conversation.threadId ? { threadId: conversation.threadId } : {}),
          sessionId,
          ...(cwd ? { cwd } : {}),
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: conversationSessionsTable.conversationKey,
          set: {
            bridgeId: conversation.bridgeId,
            channelId: conversation.channelId,
            threadId: conversation.threadId ?? null,
            sessionId,
            cwd: cwd ?? null,
            updatedAt: timestamp,
          },
        });

      if (cwd) {
        await database.db
          .insert(sessionWorkdirsTable)
          .values({
            sessionId,
            cwd,
            updatedAt: timestamp,
          })
          .onConflictDoUpdate({
            target: sessionWorkdirsTable.sessionId,
            set: {
              cwd,
              updatedAt: timestamp,
            },
          });
      }
    },

    async clearSessionForConversation(conversation: ConversationRef): Promise<void> {
      const key = conversationKey(conversation);
      await database.db.delete(conversationSessionsTable).where(eq(conversationSessionsTable.conversationKey, key));
    },

    async setSessionCwd(sessionId: string, cwd: string): Promise<void> {
      const timestamp = nowIso();
      await database.db
        .insert(sessionWorkdirsTable)
        .values({
          sessionId,
          cwd,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: sessionWorkdirsTable.sessionId,
          set: {
            cwd,
            updatedAt: timestamp,
          },
        });

      await database.db
        .update(conversationSessionsTable)
        .set({
          cwd,
          updatedAt: timestamp,
        })
        .where(eq(conversationSessionsTable.sessionId, sessionId));
    },

    async getSessionCwd(sessionId: string): Promise<string | undefined> {
      const rows = await database.db
        .select()
        .from(sessionWorkdirsTable)
        .where(eq(sessionWorkdirsTable.sessionId, sessionId))
        .limit(1);

      return rows[0]?.cwd;
    },
  };
}
