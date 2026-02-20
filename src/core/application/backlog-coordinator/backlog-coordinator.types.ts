import type { InboundEnvelope } from "../../domain/envelope.types";

export type BacklogDecision = "all" | "latest" | "override" | "ignore";

export type BacklogBatch = {
  conversationKey: string;
  messages: InboundEnvelope[];
};
