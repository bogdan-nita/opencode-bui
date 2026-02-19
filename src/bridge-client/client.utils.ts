import { hc } from "hono/client";
import type { PluginBridgeAppType } from "@infra/plugin-bridge/api.utils.js";

export type PluginBridgeEndpoint = {
  url: string;
  token: string;
};

export function createPluginBridgeClient(endpoint: PluginBridgeEndpoint) {
  return hc<PluginBridgeAppType>(endpoint.url, {
    headers: {
      "x-bui-token": endpoint.token,
    },
  }) as {
    v1: {
      plugin: {
        send: {
          $post: (input: { json: unknown }) => Promise<Response>;
        };
      };
    };
  };
}
