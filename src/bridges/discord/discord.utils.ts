import type { OutboundEnvelope } from "../../core/domain/envelope.types.js";

export function renderDiscordNotImplementedEnvelope(envelope: OutboundEnvelope): string {
  const text = envelope.text || envelope.chunks?.join("\n") || "";
  return `Discord bridge not implemented yet. Requested send: ${text.slice(0, 120)}`;
}
