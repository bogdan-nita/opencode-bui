import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { writePluginBridgeDiscovery } from "@api/discovery";
import { createPluginBridgeHandler } from "@api/api";
import { logger } from "@runtime/logger";
import type { SessionStore } from "@bridge/session-store.types";
import type { BridgeAdapter } from "@bridge/bridge-adapter.types";

export type PluginBridgeConfig = {
  runtimeDir: string;
  bridges: BridgeAdapter[];
  sessionStore: SessionStore;
};

export type PluginBridgeServer = {
  stop: (closeActiveConnections?: boolean) => void;
};

export function parseEnvInt(value: string | undefined, defaultValue: number): number {
  const raw = Number.parseInt(value || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultValue;
}

export async function startPluginBridgeServer(config: PluginBridgeConfig): Promise<PluginBridgeServer | undefined> {
  const pluginBridgeServerEnabled = process.env.BUI_PLUGIN_BRIDGE_SERVER === "1";
  const pluginBridgeHost = process.env.BUI_PLUGIN_BRIDGE_HOST?.trim() || "127.0.0.1";
  const pluginBridgePort = parseEnvInt(process.env.BUI_PLUGIN_BRIDGE_PORT, 4499);
  const configuredPluginBridgeToken = process.env.BUI_PLUGIN_BRIDGE_TOKEN?.trim();
  const pluginBridgeToken = configuredPluginBridgeToken && configuredPluginBridgeToken.length > 0
    ? configuredPluginBridgeToken
    : randomBytes(24).toString("hex");
  const pluginDiscoveryPath = process.env.BUI_PLUGIN_BRIDGE_DISCOVERY?.trim()
    || resolve(config.runtimeDir, "plugin-bridge.discovery.json");

  const bunRuntime = (globalThis as { Bun?: { serve: (input: { hostname: string; port: number; fetch: (request: Request) => Promise<Response> | Response }) => { stop: (closeActiveConnections?: boolean) => void } } }).Bun;

  if (!pluginBridgeServerEnabled || !bunRuntime) {
    if (pluginBridgeServerEnabled) {
      logger.warn("[bui] Plugin bridge server requested but Bun runtime API is unavailable.");
    }
    return undefined;
  }

  const bridgeHandler = createPluginBridgeHandler({
    token: pluginBridgeToken,
    onSend: async (payload) => {
      const conversation = await config.sessionStore.getConversationBySessionID(payload.sessionId);
      if (!conversation) {
        return { ok: false as const, status: 404 as const, error: "session not mapped to bridge conversation" };
      }
      const bridge = config.bridges.find((item) => item.id === conversation.bridgeId);
      if (!bridge) {
        return { ok: false as const, status: 404 as const, error: "bridge not available" };
      }

      try {
        await bridge.send({
          bridgeId: bridge.id,
          conversation,
          ...(payload.text ? { text: payload.text } : {}),
          ...(payload.attachments
            ? {
              attachments: payload.attachments.map((entry) => ({
                filePath: entry.filePath,
                kind: entry.kind || "document",
                ...(entry.caption ? { caption: entry.caption } : {}),
              })),
            }
            : {}),
        });
        return { ok: true as const };
      } catch (error) {
        logger.error({ error }, "[bui] Plugin bridge send failed.");
        return { ok: false as const, status: 500 as const, error: "bridge send failed" };
      }
    },
  });

  const server = bunRuntime.serve({
    hostname: pluginBridgeHost,
    port: pluginBridgePort,
    fetch: async (request: Request) => {
      const response = await bridgeHandler.handle(request);
      return response || new Response("not found", { status: 404 });
    },
  });

  const pluginBridgeUrl = `http://${pluginBridgeHost}:${pluginBridgePort}`;
  await writePluginBridgeDiscovery(pluginDiscoveryPath, {
    url: pluginBridgeUrl,
    token: pluginBridgeToken,
    updatedAt: new Date().toISOString(),
    pid: process.pid,
  });

  if (!configuredPluginBridgeToken) {
    logger.info({ discoveryPath: pluginDiscoveryPath }, "[bui] Generated plugin bridge token and wrote discovery file.");
  }
  logger.info({ host: pluginBridgeHost, port: pluginBridgePort, discoveryPath: pluginDiscoveryPath }, "[bui] Plugin bridge server started.");

  return server;
}
