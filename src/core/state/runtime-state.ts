import type { InboundEnvelope } from "@bridge/types";
import type { RuntimeState } from "./runtime-state.types";
import { logger } from "@infra/logger";

export function createRuntimeState(): RuntimeState {
  return {
    pendingBacklog: new Map(),
    backlogTimers: new Map(),
    unresolvedBacklog: new Map(),
    activeRuns: new Map(),
    sessionIdleTimers: new Map(),
    conversationRefs: new Map(),
    pendingPermissions: new Map(),
    lastPermissionByConversation: new Map(),
  };
}

export function clearSessionIdleTimer(state: RuntimeState, key: string): void {
  const timer = state.sessionIdleTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    state.sessionIdleTimers.delete(key);
  }
}

export function scheduleSessionIdleExpiry(
  state: RuntimeState,
  key: string,
  sessionIdleTimeoutMs: number,
  clearSession: (conversation: InboundEnvelope["conversation"]) => Promise<void>,
): void {
  if (sessionIdleTimeoutMs <= 0) {
    return;
  }
  clearSessionIdleTimer(state, key);
  const conversation = state.conversationRefs.get(key);
  if (!conversation) {
    return;
  }
  const timer = setTimeout(() => {
    state.sessionIdleTimers.delete(key);
    void (async () => {
      try {
        await clearSession(conversation);
        logger.info({ conversation: key, idleSeconds: sessionIdleTimeoutMs / 1000 }, "[bui] Cleared idle conversation session mapping.");
      } catch (error) {
        logger.warn({ conversation: key, error }, "[bui] Failed to clear idle conversation session mapping.");
      }
    })();
  }, sessionIdleTimeoutMs);
  state.sessionIdleTimers.set(key, timer);
}
