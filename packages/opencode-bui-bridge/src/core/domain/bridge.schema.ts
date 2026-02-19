import { z } from "zod";

export const bridgeIdSchema = z.enum(["telegram", "discord"]);

export const userRefSchema = z.object({
  id: z.string().min(1),
  username: z.string().optional(),
  displayName: z.string().optional(),
});

export const channelRefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["dm", "group", "thread", "guild-channel", "unknown"]),
  title: z.string().optional(),
});

export const conversationRefSchema = z.object({
  bridgeId: bridgeIdSchema,
  channelId: z.string().min(1),
  threadId: z.string().optional(),
});

export const bridgeCapabilitiesSchema = z.object({
  slashCommands: z.boolean(),
  buttons: z.boolean(),
  mediaUpload: z.boolean(),
  mediaDownload: z.boolean(),
  messageEdit: z.boolean(),
  threads: z.boolean(),
  markdown: z.enum(["none", "limited", "rich"]),
});
