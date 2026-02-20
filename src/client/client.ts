import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { PLUGIN_BRIDGE_RPC_PATH, PLUGIN_BRIDGE_TOKEN_HEADER } from "../api/plugin-bridge.consts";
import type { PluginBridgeClient } from "../api/api.types";
import type { PluginBridgeEndpoint } from "./client.types";

export function createPluginBridgeClient(endpoint: PluginBridgeEndpoint): PluginBridgeClient {
  const link = new RPCLink({
    url: `${endpoint.url.replace(/\/+$/, "")}${PLUGIN_BRIDGE_RPC_PATH}`,
    headers: {
      [PLUGIN_BRIDGE_TOKEN_HEADER]: endpoint.token,
    },
  });

  return createORPCClient(link);
}

export type { PluginBridgeEndpoint } from "./client.types";
