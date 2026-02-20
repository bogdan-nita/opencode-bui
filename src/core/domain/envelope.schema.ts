import { z } from "zod";
import { bridgeIdSchema, channelRefSchema, conversationRefSchema, userRefSchema } from "./bridge.schema";

const inboundTextEventSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const inboundSlashEventSchema = z.object({
  type: z.literal("slash"),
  command: z.string(),
  args: z.string(),
  raw: z.string(),
});

const inboundMediaEventSchema = z.object({
  type: z.literal("media"),
  mediaKind: z.enum(["image", "audio", "video", "document"]),
  fileId: z.string(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  caption: z.string().optional(),
});

const inboundButtonEventSchema = z.object({
  type: z.literal("button"),
  actionId: z.string(),
  value: z.string().optional(),
});

const inboundSystemEventSchema = z.object({
  type: z.literal("system"),
  event: z.enum(["bridge-started", "bridge-reconnected", "unknown"]),
  payload: z.record(z.unknown()).optional(),
});

export const inboundEventSchema = z.discriminatedUnion("type", [
  inboundTextEventSchema,
  inboundSlashEventSchema,
  inboundMediaEventSchema,
  inboundButtonEventSchema,
  inboundSystemEventSchema,
]);

export const inboundEnvelopeSchema = z.object({
  bridgeId: bridgeIdSchema,
  conversation: conversationRefSchema,
  user: userRefSchema,
  channel: channelRefSchema,
  receivedAtUnixSeconds: z.number().int().nonnegative(),
  event: inboundEventSchema,
  raw: z.unknown().optional(),
});

export const outboundActionButtonSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().optional(),
});

export const outboundAttachmentSchema = z.object({
  kind: z.enum(["image", "audio", "video", "document"]),
  filePath: z.string(),
  caption: z.string().optional(),
});

export const outboundEnvelopeSchema = z.object({
  bridgeId: bridgeIdSchema,
  conversation: conversationRefSchema,
  text: z.string().optional(),
  chunks: z.array(z.string()).optional(),
  attachments: z.array(outboundAttachmentSchema).optional(),
  buttons: z.array(z.array(outboundActionButtonSchema)).optional(),
  meta: z.record(z.string()).optional(),
});
