import type { BridgeAdapter, ConversationRef, OutboundEnvelope, SessionStore, OpenCodeClient } from "@bridge/types";
import { captureScreenshot } from "@bridge/media-coordinator";
import { logger } from "@infra/logger";

export type ScreenshotDeps = {
  bridge: BridgeAdapter;
  conversation: ConversationRef;
  sessionStore: SessionStore;
  openCodeClient: OpenCodeClient;
  uploadDir: string;
};

export async function captureAndAnalyzeScreenshot(
  message: OutboundEnvelope,
  deps: ScreenshotDeps,
): Promise<void> {
  if (message.meta?.["action"] !== "capture-screenshot") {
    return;
  }

  const note = message.meta?.["note"];
  const conversationKey = `${deps.conversation.channelId}:${deps.conversation.threadId || ""}`;

  try {
    const path = await captureScreenshot(deps.uploadDir, {
      conversationId: conversationKey,
      ...(note ? { note } : {}),
    });
    logger.info({ path }, "[bui] Screenshot captured.");

    await deps.bridge.send({
      bridgeId: deps.bridge.id,
      conversation: deps.conversation,
      attachments: [{ kind: "image", filePath: path, caption: "Captured screenshot" }],
      text: "Screenshot captured and sent. Analyzing...",
    });

    const mapping = await deps.sessionStore.getSessionByConversation(deps.conversation);
    const result = await deps.openCodeClient.runPrompt({
      conversationKey,
      prompt: `User shared a local screenshot at ${path}${note ? `\nNote: ${note}` : ""}. Analyze and help.`,
      ...(mapping?.sessionId ? { sessionId: mapping.sessionId } : {}),
      ...(mapping?.cwd ? { cwd: mapping.cwd } : {}),
    });

    if (result.sessionId && result.sessionId !== mapping?.sessionId) {
      await deps.sessionStore.setSessionForConversation(deps.conversation, result.sessionId, mapping?.cwd);
    }

    await deps.bridge.send({
      bridgeId: deps.bridge.id,
      conversation: deps.conversation,
      text: result.text || "No text returned.",
    });
  } catch (error) {
    logger.error({ error }, "[bui] Screenshot pipeline failed.");
    await deps.bridge.send({
      bridgeId: deps.bridge.id,
      conversation: deps.conversation,
      text: "Screenshot capture/send failed. Check runtime logs for details.",
    });
  }
}
