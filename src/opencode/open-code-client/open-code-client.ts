// Main export - client factory
export { createOpenCodeClient } from "./client-core";

// Types
export type {
  ClientBootstrapOptions,
  SdkContext,
  OpencodeEvent,
  BridgeAttachmentDirective,
  InstanceState,
  RunPromptStreamInput,
  RunPromptStreamResult,
  ExtractedPermission,
} from "./client.types";

// Schemas
export {
  ClientBootstrapOptionsSchema,
  BridgeAttachmentDirectiveSchema,
  OpencodeEventSchema,
  PermissionResponseSchema,
} from "./client.schema";

// Utilities
export {
  shouldInjectBridgeToolPrompt,
  stripQuotes,
  parseBridgeAttachmentDirectives,
  buildBridgeToolsPreamble,
  errorToString,
  inferAttachmentKind,
  normalizePath,
  resolveAttachment,
  formatToolActivity,
  eventSessionId,
  normalizeEvent,
  extractPermissionRequest,
} from "./client.utils";
