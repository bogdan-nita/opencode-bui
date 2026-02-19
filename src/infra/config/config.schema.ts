import { z } from "zod";

export const bridgeNameSchema = z.enum(["telegram", "discord"]);

export const userConfigSchema = z
  .object({
    runtimeDir: z.string().optional(),
    dbPath: z.string().optional(),
    uploadDir: z.string().optional(),
    lockPath: z.string().optional(),
    opencodeBin: z.string().optional(),
    opencodeAttachUrl: z.string().optional(),
    sessionIdleTimeoutSeconds: z.number().int().positive().optional(),
    bridges: z
      .object({
        telegram: z
          .object({
            enabled: z.boolean().optional(),
            token: z.string().optional(),
            allowedUserIds: z.union([z.array(z.number().int()), z.string()]).optional(),
            allowedUsers: z.union([z.array(z.union([z.string(), z.number().int()])), z.string()]).optional(),
            sttCommand: z.string().optional(),
            sttTimeoutMs: z.number().int().optional(),
            backlogStaleSeconds: z.number().int().optional(),
            backlogBatchWindowMs: z.number().int().optional(),
            polling: z.object({ dropPendingUpdates: z.boolean().optional() }).optional(),
            commands: z.object({ registerOnStart: z.boolean().optional() }).optional(),
            formatting: z.object({ maxChunkChars: z.number().int().positive().optional() }).optional(),
          })
          .optional(),
        discord: z
          .object({
            enabled: z.boolean().optional(),
            token: z.string().optional(),
            applicationId: z.string().optional(),
            guildScope: z.enum(["global", "guild"]).optional(),
            commandSyncMode: z.enum(["on-start", "manual"]).optional(),
            defaultGuildId: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

export const mergedConfigSchema = z.object({
  opencodeBin: z.string().min(1),
  opencodeAttachUrl: z.string(),
  sessionIdleTimeoutSeconds: z.number().int().positive(),
  runtimeDir: z.string().min(1),
  dbPath: z.string().min(1),
  uploadDir: z.string().min(1),
  lockPath: z.string().min(1),
  bridges: z.object({
    telegram: z.object({
      enabled: z.boolean(),
      token: z.string(),
      allowedUserIds: z.array(z.number().int()),
      allowedUsers: z.array(z.string()),
      sttCommand: z.string(),
      sttTimeoutMs: z.number().int().positive(),
      backlogStaleSeconds: z.number().int().nonnegative(),
      backlogBatchWindowMs: z.number().int().nonnegative(),
      polling: z.object({ dropPendingUpdates: z.boolean() }),
      commands: z.object({ registerOnStart: z.boolean() }),
      formatting: z.object({ maxChunkChars: z.number().int().positive() }),
    }),
    discord: z.object({
      enabled: z.boolean(),
      token: z.string(),
      applicationId: z.string(),
      guildScope: z.enum(["global", "guild"]),
      commandSyncMode: z.enum(["on-start", "manual"]),
      defaultGuildId: z.string().optional(),
    }),
  }),
});

export type MergedConfigInput = z.infer<typeof mergedConfigSchema>;
