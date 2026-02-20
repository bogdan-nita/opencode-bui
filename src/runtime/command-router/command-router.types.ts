import type { InboundEnvelope, OutboundEnvelope } from "@bridge/envelope.types";

export type CommandRouterInput = {
  envelope: InboundEnvelope;
};

export type CommandRouterOutput = {
  outbound: OutboundEnvelope[];
};
