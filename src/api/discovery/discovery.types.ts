import type { z } from "zod";
import type { pluginBridgeDiscoverySchema } from "./discovery.schema";

export type PluginBridgeDiscovery = z.infer<typeof pluginBridgeDiscoverySchema>;
