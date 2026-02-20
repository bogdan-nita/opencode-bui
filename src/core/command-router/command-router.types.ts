import type { InboundEnvelope, OutboundEnvelope } from "@bridge/types";

export type CommandRouterInput = {
  envelope: InboundEnvelope;
};

export type CommandRouterOutput = {
  outbound: OutboundEnvelope[];
};
