import type { OutboundAttachment } from "@bridge/types";

/** Options for bootstrapping the OpenCode client */
export type ClientBootstrapOptions = {
  opencodeBin: string;
  attachUrl?: string;
};

/** SDK context containing the client and optional process info */
export type SdkContext = {
  client: import("@opencode-ai/sdk").OpencodeClient;
  pid?: number;
  close?: () => void;
};

/** OpenCode event structure */
export type OpencodeEvent = {
  type: string;
  properties?: Record<string, unknown>;
};

/** Directive for attaching files via bridge commands */
export type BridgeAttachmentDirective = {
  pathLike: string;
  caption?: string;
};

/** State for tracking OpenCode instances per conversation */
export type InstanceState = {
  contextPromise: Promise<SdkContext>;
  lastActiveUnixSeconds: number;
  idleTimer?: ReturnType<typeof setTimeout>;
  bridgeGuidanceSeededSessions: Set<string>;
};

/** Input for the runPromptStream function */
export type RunPromptStreamInput = {
  conversationKey: string;
  prompt: string;
  sessionId?: string;
  cwd?: string;
  signal?: AbortSignal;
  onActivity?: (line: string) => Promise<void> | void;
  onPermissionRequest?: (permission: {
    id: string;
    sessionId: string;
    title: string;
    type: string;
    pattern?: string;
    details?: string;
  }) => Promise<"once" | "always" | "reject">;
};

/** Result from runPromptStream */
export type RunPromptStreamResult = {
  sessionId?: string;
  text: string;
  activity?: string[];
  attachments?: OutboundAttachment[];
};

/** Extracted permission request from OpenCode events */
export type ExtractedPermission = {
  id: string;
  sessionId: string;
  title: string;
  type: string;
  pattern?: string;
  details?: string;
  filePathCandidate?: string;
};
