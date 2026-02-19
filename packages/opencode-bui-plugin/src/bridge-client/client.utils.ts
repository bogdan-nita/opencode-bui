import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { PluginBridgeClient } from "opencode-bui-bridge/plugin-bridge";

export type PluginBridgeEndpoint = {
  url: string;
  token: string;
};

export function createPluginBridgeClient(endpoint: PluginBridgeEndpoint): PluginBridgeClient {
  const link = new RPCLink({
    url: `${endpoint.url.replace(/\/+$/, "")}/rpc`,
    headers: {
      "x-bui-token": endpoint.token,
    },
  });

  return createORPCClient(link);
}
