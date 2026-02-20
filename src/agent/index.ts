// Main agent exports
export { runOpencode, type RunOpencodeInput } from "./agent";
export { opencodeEventSchema, opencodeEventPartSchema, opencodeEventPartStateSchema, opencodeEventPartMetadataSchema, opencodeEventPartTokensSchema, opencodeEventPartMetadataFilesSchema, type OpenCodeEvent, type OpenCodeEventPart } from "./agent.schema";

// Re-export client module
export { createOpenCodeClient } from "./client";
export type {
  ClientBootstrapOptions,
  SdkContext,
  OpencodeEvent,
  BridgeAttachmentDirective,
  InstanceState,
  RunPromptStreamInput,
  RunPromptStreamResult,
  ExtractedPermission,
} from "./client";

// Re-export commands module
export { discoverOpencodeCommands, mergeBridgeCommands } from "./commands";
