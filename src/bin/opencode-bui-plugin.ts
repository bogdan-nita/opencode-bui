#!/usr/bin/env bun

import { cac } from "cac";

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

    const url = process.env.BUI_PLUGIN_BRIDGE_URL || "http://127.0.0.1:4499/v1/plugin/send";
    const token = process.env.BUI_PLUGIN_BRIDGE_TOKEN;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-bui-token": token } : {}),
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
