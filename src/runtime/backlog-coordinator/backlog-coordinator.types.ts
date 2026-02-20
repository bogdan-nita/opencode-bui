import type { InboundEnvelope } from "@bridge/envelope.types";

export type BacklogDecision = "all" | "latest" | "override" | "ignore";

export type BacklogBatch = {
  conversationKey: string;
  messages: InboundEnvelope[];
};
