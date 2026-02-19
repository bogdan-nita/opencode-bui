import type { BridgeCapabilities, BridgeId } from "../domain/bridge.types.js";
import type { InboundEnvelope, OutboundEnvelope } from "../domain/envelope.types.js";

export type BridgeHealth = {
  bridgeId: BridgeId;
  status: "starting" | "ready" | "degraded" | "stopped";
  details?: string;
};

export type BridgeCommandDescriptor = {
  command: string;
  description: string;
};

export type BridgeRuntimeHandlers = {
  onInbound: (envelope: InboundEnvelope) => Promise<void>;
};

export type BridgeAdapter = {
  id: BridgeId;
  capabilities: BridgeCapabilities;
  start: (handlers: BridgeRuntimeHandlers) => Promise<void>;
  stop: () => Promise<void>;
  send: (envelope: OutboundEnvelope) => Promise<void>;
  downloadMedia?: (envelope: InboundEnvelope & { event: { type: "media"; fileId: string; fileName?: string; mimeType?: string } }) => Promise<{
    bytes: Uint8Array;
    fileNameHint?: string;
    mimeType?: string;
  }>;
  setCommands: (commands: BridgeCommandDescriptor[]) => Promise<void>;
  health: () => Promise<BridgeHealth>;
};
