import { z } from "zod";

export const pluginBridgeDiscoverySchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  updatedAt: z.string().min(1),
  pid: z.number().int().positive(),
});
