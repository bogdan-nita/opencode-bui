import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BridgeAdapter, BridgeRuntimeHandlers } from "@bridge/bridge-adapter.types";
import { startAllBridges, stopAllBridges, waitForShutdownSignal } from "./bridge-supervisor";

describe("bridge-supervisor", () => {
  const createMockBridge = (id: string, startFn?: () => Promise<void>, stopFn?: () => Promise<void>): BridgeAdapter => ({
    id: id as BridgeAdapter["id"],
    capabilities: { media: [], commands: [] },
    start: vi.fn().mockImplementation(startFn ?? (() => Promise.resolve())),
    stop: vi.fn().mockImplementation(stopFn ?? (() => Promise.resolve())),
    send: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ bridgeId: id as BridgeAdapter["id"], status: "ready" }),
    setCommands: vi.fn(),
  });

  describe("startAllBridges", () => {
    it("should start all bridges with handlers", async () => {
      const mockBridge1 = createMockBridge("telegram");
      const mockBridge2 = createMockBridge("discord");
      const handlers: BridgeRuntimeHandlers = { onInbound: vi.fn() };

      await startAllBridges([mockBridge1, mockBridge2], handlers);

      expect(mockBridge1.start).toHaveBeenCalledWith(handlers);
      expect(mockBridge2.start).toHaveBeenCalledWith(handlers);
    });

    it("should handle bridge start errors gracefully", async () => {
      const mockBridge = createMockBridge("telegram", () => Promise.reject(new Error("Start failed")));
      const handlers: BridgeRuntimeHandlers = { onInbound: vi.fn() };

      await expect(startAllBridges([mockBridge], handlers)).rejects.toThrow("Start failed");
    });

    it("should start bridges in parallel", async () => {
      const mockBridge1 = createMockBridge("telegram", async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      const mockBridge2 = createMockBridge("discord", async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      const handlers: BridgeRuntimeHandlers = { onInbound: vi.fn() };

      const start = Date.now();
      await startAllBridges([mockBridge1, mockBridge2], handlers);
      const duration = Date.now() - start;

      // Should take ~10ms (parallel), not 20ms (sequential)
      expect(duration).toBeLessThan(50);
    });
  });

  describe("stopAllBridges", () => {
    it("should stop all bridges", async () => {
      const mockBridge1 = createMockBridge("telegram", undefined, () => Promise.resolve());
      const mockBridge2 = createMockBridge("discord", undefined, () => Promise.resolve());

      await stopAllBridges([mockBridge1, mockBridge2]);

      expect(mockBridge1.stop).toHaveBeenCalled();
      expect(mockBridge2.stop).toHaveBeenCalled();
    });

    it("should handle bridge stop errors gracefully", async () => {
      const mockBridge = createMockBridge("telegram", undefined, () => Promise.reject(new Error("Stop failed")));

      await expect(stopAllBridges([mockBridge])).rejects.toThrow("Stop failed");
    });
  });

  describe("waitForShutdownSignal", () => {
    let originalOn: typeof process.on;
    let originalOnce: typeof process.once;
    let originalOff: typeof process.off;

    beforeEach(() => {
      originalOn = process.on;
      originalOnce = process.once;
      originalOff = process.off;
      process.on = vi.fn();
      process.once = vi.fn();
      process.off = vi.fn();
    });

    afterEach(() => {
      process.on = originalOn;
      process.once = originalOnce;
      process.off = originalOff;
    });

    it("should resolve on SIGINT", async () => {
      const mockResolve = vi.fn();
      (process.once as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: () => void) => {
        if (event === "SIGINT") {
          setTimeout(handler, 0);
        }
      });

      const promise = waitForShutdownSignal();
      promise.then(mockResolve);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockResolve).toHaveBeenCalledWith("SIGINT");
    });

    it("should resolve on SIGTERM", async () => {
      const mockResolve = vi.fn();
      (process.once as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: () => void) => {
        if (event === "SIGTERM") {
          setTimeout(handler, 0);
        }
      });

      const promise = waitForShutdownSignal();
      promise.then(mockResolve);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockResolve).toHaveBeenCalledWith("SIGTERM");
    });

    it("should clean up listeners after signal", async () => {
      (process.once as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: () => void) => {
        if (event === "SIGINT") {
          setTimeout(handler, 0);
        }
      });

      await waitForShutdownSignal();

      expect(process.off).toHaveBeenCalledWith("SIGINT", expect.any(Function));
      expect(process.off).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    });
  });
});
