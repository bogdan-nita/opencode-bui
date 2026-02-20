import { spawn } from "node:child_process";
import { defaultPluginDiscoveryPath, readPluginBridgeDiscovery } from "../infra/plugin-bridge/discovery";
import { createPluginBridgeClient } from "../bridge-client/client";

let bridgeBootAttempted = false;

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

export async function isBridgeHealthy(sendUrl) {
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

export async function resolveEndpoint() {
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

function bootBridgeCommand() {
  const explicit = process.env.BUI_BRIDGE_BOOT_COMMAND?.trim();
  if (explicit) {
    return explicit;
  }
  if (process.env.BUI_DEV_HOT_RELOAD === "1") {
    return "bun --watch src/bin/opencode-bui.ts start";
  }
  return "opencode-bui-bridge start";
}

export function spawnBridgeBoot() {
  const command = bootBridgeCommand();
  const child = spawn(command, {
    shell: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return command;
}

export async function ensureBridgeBooted() {
  if (bridgeBootAttempted) {
    return;
  }
  bridgeBootAttempted = true;

  try {
    const endpoint = await resolveEndpoint();
    if (await isBridgeHealthy(endpoint.url)) {
      return;
    }
  } catch {
    // bridge likely not started yet; try boot command
  }

  spawnBridgeBoot();
}

export async function sendToBridge(args, context) {
  const endpoint = await resolveEndpoint();
  const client = createPluginBridgeClient(endpoint);
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

  await client.plugin.send(payload);

  return "Sent to BUI bridge.";
}

export async function waitForBridgeReady(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const endpoint = await resolveEndpoint();
      if (await isBridgeHealthy(endpoint.url)) {
        return true;
      }
    } catch {
      // discovery not ready yet
    }
    await sleep(400);
  }
  return false;
}
