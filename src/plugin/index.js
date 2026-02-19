import { tool } from "@opencode-ai/plugin";
import { defaultPluginDiscoveryPath, readPluginBridgeDiscovery } from "../infra/plugin-bridge/discovery.utils.js";
import { createPluginBridgeClient } from "../bridge-client/client.utils.js";
import { spawn } from "node:child_process";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveHealthUrl(sendUrl) {
  try {
    const value = new URL(sendUrl);
    value.pathname = "/health";
    value.search = "";
    return value.toString();
  } catch {
    return undefined;
  }
}

async function isBridgeHealthy(sendUrl) {
  const healthUrl = deriveHealthUrl(sendUrl);
  if (!healthUrl) {
    return false;
  }
  try {
    const response = await fetch(healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBridgeReady(timeoutMs) {
  const startedAt = Date.now();
  const discoveryPath =
    process.env.BUI_PLUGIN_BRIDGE_DISCOVERY?.trim()
    || process.env.BUI_PLUGIN_DISCOVERY?.trim()
    || defaultPluginDiscoveryPath();

  while (Date.now() - startedAt < timeoutMs) {
    const discovery = await readPluginBridgeDiscovery(discoveryPath);
    if (discovery && (await isBridgeHealthy(discovery.url))) {
      return discovery;
    }
    await sleep(500);
  }

  return undefined;
}

function bootBridgeCommand(input) {
  const command = input?.trim() || process.env.BUI_BRIDGE_BOOT_COMMAND?.trim() || "opencode-bui start";
  const child = spawn(command, {
    shell: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return command;
}

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
      bui_bridge_boot: tool({
        description: "Ensure the BUI bridge process is running.",
        args: {
          command: tool.schema.string().optional().describe("Override boot command. Defaults to 'opencode-bui start'."),
          timeoutSeconds: tool.schema.number().int().positive().max(120).optional(),
        },
        async execute(args) {
          const endpoint = await resolveEndpoint().catch(() => undefined);
          if (endpoint && (await isBridgeHealthy(endpoint.url))) {
            return "BUI bridge is already running.";
          }

          const command = bootBridgeCommand(args.command);
          const timeoutMs = (args.timeoutSeconds || 20) * 1000;
          const ready = await waitForBridgeReady(timeoutMs);
          if (!ready) {
            return `Bridge boot command executed (${command}) but bridge did not become healthy within ${timeoutMs / 1000}s.`;
          }

          return `Bridge started successfully via '${command}'.`;
        },
      }),
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
