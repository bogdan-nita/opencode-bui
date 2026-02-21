import type { ConversationRef } from "@bridge/types";
import type { BridgeAdapter } from "@bridge/types";
import { logger } from "@infra/logger";

export type TypingDeps = {
  bridge: BridgeAdapter;
  conversation: ConversationRef;
};

export async function startTypingIndicator(deps: TypingDeps): Promise<(() => Promise<void> | void) | undefined> {
  const { bridge, conversation } = deps;
  if (!bridge.beginTyping) {
    return undefined;
  }
  try {
    const stop = await bridge.beginTyping(conversation);
    logger.info({ bridgeId: bridge.id, conversation }, "[bui] Typing indicator started.");
    return stop;
  } catch (error) {
    logger.warn({ error, bridgeId: bridge.id, conversation }, "[bui] Failed to start typing indicator.");
    return undefined;
  }
}

export async function stopTypingIndicator(stop: (() => Promise<void> | void) | undefined): Promise<void> {
  if (!stop) {
    return;
  }
  try {
    await stop();
    logger.info("[bui] Typing indicator stopped.");
  } catch (error) {
    logger.warn({ error }, "[bui] Failed to stop typing indicator.");
  }
}
