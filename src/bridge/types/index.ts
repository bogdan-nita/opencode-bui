// Bridge types - core interfaces and types
export type { BridgeID, BridgeId, UserRef, ChannelRef, ConversationRef, BridgeCapabilities } from "./bridge.types";
export type { InboundEnvelope, OutboundEnvelope, InboundEvent, InboundTextEvent, InboundSlashEvent, InboundMediaEvent, InboundButtonEvent, InboundSystemEvent, OutboundActionButton, OutboundAttachment } from "./envelope.types";
export type { BridgeAdapter, BridgeHealth, BridgeCommandDescriptor, BridgeRuntimeHandlers } from "./bridge-adapter.types";
export type { AgentStore, AgentTemplate } from "./agent-store.types";
export type { MediaStore } from "./media-store.types";
export type { LockService, LockHandle } from "./lock-service.types";
export type { Clock } from "./clock.types";
export type { SessionStore, SessionMapping } from "./session-store.types";
export type { PermissionStore, PermissionRecord, PermissionDecision } from "./permission-store.types";
export type { OpenCodeClient, OpenCodeResult, OpenCodeRunOptions } from "./open-code-client.types";

// Schemas
export * from "./envelope.schema";
export * from "./bridge.schema";
