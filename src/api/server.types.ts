import type { RouterClient } from "@orpc/server";
import type { z } from "zod";
import type { pluginBridgeSendPayloadSchema } from "./server.schema";
import type { createPluginBridgeRouter } from "./server";

export type PluginBridgeSendPayload = z.infer<typeof pluginBridgeSendPayloadSchema>;

export type PluginBridgeSendResult =
  | { ok: true }
  | { ok: false; status: 404 | 500; error: string };

export type PluginBridgeRouter = ReturnType<typeof createPluginBridgeRouter>;
export type PluginBridgeClient = RouterClient<PluginBridgeRouter>;
