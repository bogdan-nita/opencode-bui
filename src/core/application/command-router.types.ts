import type { InboundEnvelope, OutboundEnvelope } from "../domain/envelope.types.js";

export type CommandRouterInput = {
  envelope: InboundEnvelope;
};

export type CommandRouterOutput = {
  outbound: OutboundEnvelope[];
};
