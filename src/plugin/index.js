import { tool } from "@opencode-ai/plugin";
import * as runtimeStatic from "./runtime.js";

async function runtimeModule() {
  if (process.env.BUI_PLUGIN_HOT_RELOAD === "1") {
    const ts = Date.now();
    return await import(`./runtime.js?t=${ts}`);
  }
  return runtimeStatic;
}

export const OpenCodeBuiPlugin = async () => {
  void (async () => {
    const runtime = await runtimeModule();
    await runtime.ensureBridgeBooted();
  })();

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
          const runtime = await runtimeModule();
          await runtime.ensureBridgeBooted();
          const ready = await runtime.waitForBridgeReady(8000);
          if (!ready) {
            return "Bridge is starting but not ready yet. Please retry in a few seconds.";
          }
          try {
            return await runtime.sendToBridge(args, context);
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
        },
      }),
    },
  };
};

export default OpenCodeBuiPlugin;
