import type { InboundEnvelope, OutboundEnvelope } from "@runtime/bridge/types";

export type CommandRouterInput = {
  envelope: InboundEnvelope;
};

export type CommandRouterOutput = {
  outbound: OutboundEnvelope[];
};
