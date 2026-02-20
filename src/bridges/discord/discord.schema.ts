import { z } from "zod";

export const discordBridgeConfigSchema = z.object({
  enabled: z.boolean(),
  token: z.string(),
  applicationId: z.string(),
  guildScope: z.enum(["global", "guild"]),
  commandSyncMode: z.enum(["on-start", "manual"]),
  defaultGuildId: z.string().optional(),
});
