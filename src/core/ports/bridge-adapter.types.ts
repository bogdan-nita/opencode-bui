import type { BridgeCapabilities, BridgeID } from "../domain/bridge.types";
import type { InboundEnvelope, OutboundEnvelope } from "../domain/envelope.types";

export type BridgeHealth = {
  bridgeId: BridgeID;
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
  id: BridgeID;
  capabilities: BridgeCapabilities;
  start: (handlers: BridgeRuntimeHandlers) => Promise<void>;
  stop: () => Promise<void>;
  send: (envelope: OutboundEnvelope) => Promise<void>;
  beginTyping?: (conversation: InboundEnvelope["conversation"]) => Promise<() => Promise<void> | void>;
  upsertActivityMessage?: (input: {
    conversation: InboundEnvelope["conversation"];
    text: string;
    token?: string;
  }) => Promise<string>;
  downloadMedia?: (envelope: InboundEnvelope & { event: { type: "media"; fileId: string; fileName?: string; mimeType?: string } }) => Promise<{
    bytes: Uint8Array;
    fileNameHint?: string;
    mimeType?: string;
  }>;
  setCommands: (commands: BridgeCommandDescriptor[]) => Promise<void>;
  health: () => Promise<BridgeHealth>;
};
