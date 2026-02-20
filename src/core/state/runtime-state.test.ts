import { describe, expect, it, vi } from "vitest";
import { createRuntimeState, clearSessionIdleTimer, scheduleSessionIdleExpiry } from "./runtime-state";

describe("runtime-state", () => {
  describe("createRuntimeState", () => {
    it("creates state with all required maps", () => {
      const state = createRuntimeState();

      expect(state.pendingBacklog).toBeInstanceOf(Map);
      expect(state.backlogTimers).toBeInstanceOf(Map);
      expect(state.unresolvedBacklog).toBeInstanceOf(Map);
      expect(state.activeRuns).toBeInstanceOf(Map);
      expect(state.sessionIdleTimers).toBeInstanceOf(Map);
      expect(state.conversationRefs).toBeInstanceOf(Map);
      expect(state.pendingPermissions).toBeInstanceOf(Map);
      expect(state.lastPermissionByConversation).toBeInstanceOf(Map);
    });

    it("creates empty maps", () => {
      const state = createRuntimeState();

      expect(state.pendingBacklog.size).toBe(0);
      expect(state.backlogTimers.size).toBe(0);
      expect(state.unresolvedBacklog.size).toBe(0);
      expect(state.activeRuns.size).toBe(0);
      expect(state.sessionIdleTimers.size).toBe(0);
      expect(state.conversationRefs.size).toBe(0);
      expect(state.pendingPermissions.size).toBe(0);
      expect(state.lastPermissionByConversation.size).toBe(0);
    });
  });

  describe("clearSessionIdleTimer", () => {
    it("clears and deletes timer if it exists", () => {
      const state = createRuntimeState();
      const timer = setTimeout(() => {}, 10000);
      state.sessionIdleTimers.set("key1", timer);

      clearSessionIdleTimer(state, "key1");

      expect(state.sessionIdleTimers.has("key1")).toBe(false);
    });

    it("does nothing if timer does not exist", () => {
      const state = createRuntimeState();

      clearSessionIdleTimer(state, "nonexistent");

      expect(state.sessionIdleTimers.size).toBe(0);
    });
  });

  describe("scheduleSessionIdleExpiry", () => {
    it("does nothing if sessionIdleTimeoutMs is 0", async () => {
      const state = createRuntimeState();
      const clearSession = vi.fn();

      scheduleSessionIdleExpiry(state, "key1", 0, clearSession);

      expect(state.sessionIdleTimers.size).toBe(0);
      expect(clearSession).not.toHaveBeenCalled();
    });

    it("does nothing if conversation ref does not exist", async () => {
      const state = createRuntimeState();
      const clearSession = vi.fn();

      scheduleSessionIdleExpiry(state, "key1", 1000, clearSession);

      expect(state.sessionIdleTimers.size).toBe(0);
      expect(clearSession).not.toHaveBeenCalled();
    });

    it("clears existing timer before creating new one", () => {
      const state = createRuntimeState();
      state.conversationRefs.set("key1", { bridgeId: "telegram", channelId: "1" });
      const oldTimer = setTimeout(() => {}, 10000);
      state.sessionIdleTimers.set("key1", oldTimer);

      scheduleSessionIdleExpiry(state, "key1", 1000, vi.fn());

      expect(state.sessionIdleTimers.has("key1")).toBe(true);
      expect(state.sessionIdleTimers.get("key1")).not.toBe(oldTimer);
    });

    it("schedules timer that calls clearSession after timeout", async () => {
      vi.useFakeTimers();
      const state = createRuntimeState();
      const conversation = { bridgeId: "telegram" as const, channelId: "1" };
      state.conversationRefs.set("key1", conversation);
      const clearSession = vi.fn();

      scheduleSessionIdleExpiry(state, "key1", 100, clearSession);

      expect(state.sessionIdleTimers.has("key1")).toBe(true);
      expect(clearSession).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(clearSession).toHaveBeenCalledWith(conversation);
      expect(state.sessionIdleTimers.has("key1")).toBe(false);

      vi.useRealTimers();
    });
  });
});
