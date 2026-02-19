#!/usr/bin/env bun

import { cac } from "cac";
import { defaultPluginDiscoveryPath, readPluginBridgeDiscovery } from "../infra/plugin-bridge/discovery.utils.js";

async function resolveBridgeEndpoint(input: { url?: string; token?: string; discoveryPath?: string }): Promise<{ url: string; token: string }> {
  if (input.url && input.token) {
    return { url: input.url, token: input.token };
  }

  const explicitDiscoveryPath = input.discoveryPath || process.env.BUI_PLUGIN_BRIDGE_DISCOVERY;
  const candidates = [
    explicitDiscoveryPath,
    process.env.BUI_PLUGIN_DISCOVERY,
    defaultPluginDiscoveryPath(),
  ].filter((value): value is string => Boolean(value));

  for (const path of candidates) {
    const discovery = await readPluginBridgeDiscovery(path);
    if (discovery) {
      return {
        url: input.url || discovery.url,
        token: input.token || discovery.token,
      };
    }
  }

  throw new Error(
    "Bridge endpoint discovery failed. Set BUI_PLUGIN_BRIDGE_URL and BUI_PLUGIN_BRIDGE_TOKEN or provide a discovery file.",
  );
}

const cli = cac("opencode-bui-plugin");

cli
  .command("send", "Send plugin event to BUI bridge process")
  .option("--session <id>", "OpenCode session id")
  .option("--text <text>", "Text to send")
  .option("--file <path>", "File to attach (repeat for multiple)", {
    type: [String],
  })
  .option("--caption <text>", "Caption used for all files")
  .option("--kind <kind>", "Attachment kind (image|audio|video|document)")
  .option("--url <url>", "Bridge endpoint URL")
  .option("--token <token>", "Bridge shared secret")
  .option("--discovery <path>", "Path to bridge discovery file")
  .action(async (options) => {
    const sessionId = String(options.session || "").trim();
    if (!sessionId) {
      throw new Error("Missing --session <id>");
    }

    const text = typeof options.text === "string" ? options.text : undefined;
    const fileOptions = Array.isArray(options.file)
      ? options.file
      : typeof options.file === "string"
        ? [options.file]
        : [];
    const kind = typeof options.kind === "string" ? options.kind : undefined;
    const caption = typeof options.caption === "string" ? options.caption : undefined;

    const payload = {
      sessionId,
      ...(text ? { text } : {}),
      ...(fileOptions.length > 0
        ? {
          attachments: fileOptions.map((filePath: string) => ({
            filePath,
            ...(kind ? { kind } : {}),
            ...(caption ? { caption } : {}),
          })),
        }
        : {}),
    };

    const endpoint = await resolveBridgeEndpoint({
      url: (typeof options.url === "string" ? options.url : process.env.BUI_PLUGIN_BRIDGE_URL) || undefined,
      token: (typeof options.token === "string" ? options.token : process.env.BUI_PLUGIN_BRIDGE_TOKEN) || undefined,
      discoveryPath: typeof options.discovery === "string" ? options.discovery : undefined,
    });

    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bui-token": endpoint.token,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Bridge send failed (${response.status}): ${body}`);
    }
  });

cli.help();
cli.parse();
