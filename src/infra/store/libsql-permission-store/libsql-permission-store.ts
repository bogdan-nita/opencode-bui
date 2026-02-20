import { and, eq } from "drizzle-orm";
import { formatISO } from "date-fns";
import { permissionRequestsTable } from "@infra/db/db";
import type { RuntimeDB } from "@infra/db/db";
import type { PermissionStore } from "@core/ports/permission-store.types";

function nowIso(): string {
  return formatISO(new Date());
}

export function createLibsqlPermissionStore(database: RuntimeDB): PermissionStore {
  return {
    async createPending(input) {
      const timestamp = nowIso();
      await database.db
        .insert(permissionRequestsTable)
        .values({
          permissionId: input.permissionId,
          conversationKey: input.conversationKey,
          requesterUserId: input.requesterUserId,
          status: "pending",
          expiresAtUnixSeconds: String(input.expiresAtUnixSeconds),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: permissionRequestsTable.permissionId,
          set: {
            conversationKey: input.conversationKey,
            requesterUserId: input.requesterUserId,
            status: "pending",
            response: null,
            expiresAtUnixSeconds: String(input.expiresAtUnixSeconds),
            updatedAt: timestamp,
          },
        });
    },

    async getByID(permissionId) {
      const rows = await database.db
        .select()
        .from(permissionRequestsTable)
        .where(eq(permissionRequestsTable.permissionId, permissionId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        return undefined;
      }
      const expiresAtUnixSeconds = Number.parseInt(row.expiresAtUnixSeconds, 10);
      return {
        permissionId: row.permissionId,
        conversationKey: row.conversationKey,
        requesterUserId: row.requesterUserId,
        status: row.status as "pending" | "submitted" | "expired",
        expiresAtUnixSeconds: Number.isFinite(expiresAtUnixSeconds) ? expiresAtUnixSeconds : 0,
        ...(row.response ? { response: row.response as "once" | "always" | "reject" } : {}),
      };
    },

    async markExpired(permissionId) {
      await database.db
        .update(permissionRequestsTable)
        .set({
          status: "expired",
          updatedAt: nowIso(),
        })
        .where(eq(permissionRequestsTable.permissionId, permissionId));
    },

    async resolvePending(input) {
      const current = await this.getByID(input.permissionId);
      if (!current) {
        return "missing";
      }
      if (current.status === "submitted") {
        return "already_submitted";
      }
      if (current.status === "expired") {
        return "expired";
      }

      const nowUnixSeconds = Math.floor(Date.now() / 1000);
      if (current.expiresAtUnixSeconds > 0 && current.expiresAtUnixSeconds <= nowUnixSeconds) {
        await this.markExpired(input.permissionId);
        return "expired";
      }

      const result = await database.db
        .update(permissionRequestsTable)
        .set({
          status: "submitted",
          response: input.response,
          updatedAt: nowIso(),
        })
        .where(and(
          eq(permissionRequestsTable.permissionId, input.permissionId),
          eq(permissionRequestsTable.status, "pending"),
        ));

      if (result.rowsAffected > 0) {
        return "resolved";
      }

      const refreshed = await this.getByID(input.permissionId);
      if (!refreshed) {
        return "missing";
      }
      if (refreshed.status === "submitted") {
        return "already_submitted";
      }
      return "expired";
    },
  };
}
