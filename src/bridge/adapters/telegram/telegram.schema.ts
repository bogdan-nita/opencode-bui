import { z } from "zod";
import type { BridgeAdapter } from "../../bridge/bridge-adapter.types";

export type TelegramBridgeAdapter = BridgeAdapter;

export const telegramBridgeTuningSchema = z.object({
  polling: z.object({
    dropPendingUpdates: z.boolean(),
  }),
  commands: z.object({
    registerOnStart: z.boolean(),
  }),
  formatting: z.object({
    maxChunkChars: z.number().int().positive(),
  }),
});
