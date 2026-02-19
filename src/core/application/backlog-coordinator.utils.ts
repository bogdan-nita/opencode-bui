import type { InboundEnvelope } from "../domain/envelope.types.js";
import type { BacklogDecision } from "./backlog-coordinator.types.js";

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
