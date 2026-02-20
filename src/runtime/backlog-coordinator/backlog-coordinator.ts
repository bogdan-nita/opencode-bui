import type { InboundEnvelope } from "@runtime/bridge/types";
import type { BacklogDecision } from "./backlog-coordinator.types";

export function isBacklogMessage(receivedAtUnixSeconds: number, nowUnixSeconds: number, staleSeconds: number): boolean {
  return nowUnixSeconds - receivedAtUnixSeconds > staleSeconds;
}

export function chooseBacklogMessages(messages: InboundEnvelope[], decision: BacklogDecision): InboundEnvelope[] {
  if (messages.length === 0) {
    return [];
  }
  if (decision === "latest") {
    const latest = messages[messages.length - 1];
    return latest ? [latest] : [];
  }
  if (decision === "ignore") {
    return [];
  }
  return messages;
}

export type { BacklogBatch, BacklogDecision } from "./backlog-coordinator.types";
