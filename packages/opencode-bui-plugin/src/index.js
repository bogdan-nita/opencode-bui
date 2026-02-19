import { tool } from "@opencode-ai/plugin";
import { defaultPluginDiscoveryPath, readPluginBridgeDiscovery } from "./infra/plugin-bridge/discovery.utils.js";
import { createPluginBridgeClient } from "./bridge-client/client.utils.js";

async function resolveEndpoint() {
  const envUrl = process.env.BUI_PLUGIN_BRIDGE_URL?.trim();
  const envToken = process.env.BUI_PLUGIN_BRIDGE_TOKEN?.trim();
  if (envUrl && envToken) {
    return { url: envUrl, token: envToken };
  }

  const discoveryPath =
    process.env.BUI_PLUGIN_BRIDGE_DISCOVERY?.trim()
    || process.env.BUI_PLUGIN_DISCOVERY?.trim()
    || defaultPluginDiscoveryPath();

  const discovery = await readPluginBridgeDiscovery(discoveryPath);
  if (!discovery) {
    throw new Error(
      "BUI bridge discovery not found. Set BUI_PLUGIN_BRIDGE_URL+BUI_PLUGIN_BRIDGE_TOKEN or BUI_PLUGIN_DISCOVERY.",
    );
  }

  return {
    url: envUrl || discovery.url,
    token: envToken || discovery.token,
  };
}

export const OpenCodeBuiPlugin = async () => {
  return {
    tool: {
      bui_send: tool({
        description: "Send text and optional files to the active BUI bridge conversation.",
        args: {
          sessionId: tool.schema.string().optional().describe("OpenCode session id (defaults to current tool context session)."),
          text: tool.schema.string().optional(),
          files: tool.schema.array(tool.schema.string()).optional().describe("Absolute or relative file paths to attach."),
          kind: tool.schema.enum(["image", "audio", "video", "document"]).optional(),
          caption: tool.schema.string().optional(),
        },
        async execute(args, context) {
          const endpoint = await resolveEndpoint();
          const payload = {
            sessionId: args.sessionId || context.sessionID,
            ...(args.text ? { text: args.text } : {}),
            ...(args.files && args.files.length > 0
              ? {
                attachments: args.files.map((filePath) => ({
                  filePath,
                  ...(args.kind ? { kind: args.kind } : {}),
                  ...(args.caption ? { caption: args.caption } : {}),
                })),
              }
              : {}),
          };

          const client = createPluginBridgeClient(endpoint);
          const response = await client.v1.plugin.send.$post({ json: payload });

          if (!response.ok) {
            const body = await response.text();
            return `bui_send failed (${response.status}): ${body}`;
          }

          return "Sent to BUI bridge.";
        },
      }),
    },
  };
};

export default OpenCodeBuiPlugin;
