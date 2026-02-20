import type { InboundEnvelope } from "@bridge/types";

export type PendingPermissionEntry = {
  conversationKey: string;
  requesterUserId: string;
  resolve: (response: "once" | "always" | "reject") => void;
  timer: ReturnType<typeof setTimeout>;
};

export type RuntimeState = {
  /** Messages queued during backlog window */
  pendingBacklog: Map<string, InboundEnvelope[]>;
  /** Timers for backlog window expiry */
  backlogTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Messages awaiting backlog decision */
  unresolvedBacklog: Map<string, InboundEnvelope[]>;
  /** Active OpenCode runs with abort controllers */
  activeRuns: Map<string, AbortController>;
  /** Timers for session idle expiry */
  sessionIdleTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Conversation refs for idle timer callbacks */
  conversationRefs: Map<string, InboundEnvelope["conversation"]>;
  /** Permission requests awaiting button/text response */
  pendingPermissions: Map<string, PendingPermissionEntry>;
  /** Most recent permission ID per conversation (for fallback) */
  lastPermissionByConversation: Map<string, string>;
};

export type RuntimeStateDeps = {
  sessionIdleTimeoutMs: number;
};

export type PermissionDecision = "once" | "always" | "reject";
