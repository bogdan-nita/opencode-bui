import type { BridgeId, ChannelRef, ConversationRef, UserRef } from "./bridge.types.js";

export type InboundTextEvent = {
  type: "text";
  text: string;
};

export type InboundSlashEvent = {
  type: "slash";
  command: string;
  args: string;
  raw: string;
};

export type InboundMediaEvent = {
  type: "media";
  mediaKind: "image" | "audio" | "video" | "document";
  fileId: string;
  fileName?: string;
  mimeType?: string;
  caption?: string;
};

export type InboundButtonEvent = {
  type: "button";
  actionId: string;
  value?: string;
};

export type InboundSystemEvent = {
  type: "system";
  event: "bridge-started" | "bridge-reconnected" | "unknown";
  payload?: Record<string, unknown>;
};

export type InboundEvent =
  | InboundTextEvent
  | InboundSlashEvent
  | InboundMediaEvent
  | InboundButtonEvent
  | InboundSystemEvent;

export type InboundEnvelope = {
  bridgeId: BridgeId;
  conversation: ConversationRef;
  user: UserRef;
  channel: ChannelRef;
  receivedAtUnixSeconds: number;
  event: InboundEvent;
  raw?: unknown;
};

export type OutboundActionButton = {
  id: string;
  label: string;
  value?: string;
};

export type OutboundAttachment = {
  kind: "image" | "audio" | "video" | "document";
  filePath: string;
  caption?: string;
};

export type OutboundEnvelope = {
  bridgeId: BridgeId;
  conversation: ConversationRef;
  text?: string;
  chunks?: string[];
  attachments?: OutboundAttachment[];
  buttons?: OutboundActionButton[][];
  meta?: Record<string, string>;
};
