import { stat } from "node:fs/promises";
import type { BridgeAdapter, ConversationRef, OutboundEnvelope } from "@bridge/types";
import { logger } from "@infra/logger";

export type OutboundConfig = {
  maxAttachmentsPerMessage: number;
  maxAttachmentBytes: number;
};

export async function sendOutboundMessages(
  deps: { bridge: BridgeAdapter; conversation: ConversationRef },
  outbound: OutboundEnvelope[],
  config: OutboundConfig,
): Promise<void> {
  for (const message of outbound) {
    const sanitized = await filterAttachments(deps.bridge, message, config);
    try {
      await deps.bridge.send(sanitized);
      logger.info({ bridgeId: deps.bridge.id }, "[bui] Outbound message sent.");
    } catch (error) {
      logger.error({ error, bridgeId: deps.bridge.id }, "[bui] Failed to send outbound message.");
    }
  }
}

async function filterAttachments(
  bridge: BridgeAdapter,
  message: OutboundEnvelope,
  config: OutboundConfig,
): Promise<OutboundEnvelope> {
  if (!message.attachments || message.attachments.length === 0) {
    return message;
  }

  const kept = [];
  const skipped = [];

  for (const attachment of message.attachments.slice(0, config.maxAttachmentsPerMessage)) {
    try {
      const details = await stat(attachment.filePath);
      if (details.size > config.maxAttachmentBytes) {
        skipped.push(`${attachment.filePath} (too large)`);
        continue;
      }
      kept.push(attachment);
    } catch {
      skipped.push(`${attachment.filePath} (missing)`);
    }
  }

  if (skipped.length > 0) {
    await bridge.send({
      bridgeId: bridge.id,
      conversation: message.conversation!,
      text: ["Some attachments were skipped:", ...skipped.map((l) => `- ${l}`)].join("\n"),
    });
  }

  return kept.length > 0 ? { ...message, attachments: kept } : (({ attachments: _, ...rest }) => rest)(message) as OutboundEnvelope;
}
