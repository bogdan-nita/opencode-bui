import { z } from "zod";

export const pluginBridgeSendPayloadSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().optional(),
  attachments: z.array(
    z.object({
      filePath: z.string().min(1),
      kind: z.enum(["image", "audio", "video", "document"]).optional(),
      caption: z.string().optional(),
    }),
  ).optional(),
});
