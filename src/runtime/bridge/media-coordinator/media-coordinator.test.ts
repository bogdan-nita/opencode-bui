import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { captureScreenshot } from "./media-coordinator";

vi.mock("@runtime/runtime-fs", () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@runtime/runtime-process", () => ({
  runProcess: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "", timedOut: false }),
}));

describe("media-coordinator", () => {
  describe("captureScreenshot", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockRunProcess: any;

    beforeEach(async () => {
      vi.resetModules();
      const processModule = await import("@runtime/runtime-process");
      mockRunProcess = processModule.runProcess;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should capture screenshot on darwin platform", async () => {
      // Mock platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin" });

      mockRunProcess.mockResolvedValue({ code: 0, stdout: "", stderr: "", timedOut: false });

      const result = await captureScreenshot("/tmp/uploads", {
        conversationId: "conv-123",
        note: "test-note",
      });

      expect(result).toContain("screenshot-");
      expect(result).toContain("conv-123");
      expect(result).toContain("test-note");
      expect(mockRunProcess).toHaveBeenCalledWith(
        ["/usr/sbin/screencapture", "-x", expect.stringContaining("screenshot-")],
        { timeoutMs: 15000 },
      );

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should throw when platform is unsupported", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "freebsd" });

      await expect(
        captureScreenshot("/tmp/uploads", {
          conversationId: "conv-123",
        }),
      ).rejects.toThrow("not supported on platform");

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should try multiple screenshot commands as fallback", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });

      mockRunProcess
        .mockResolvedValueOnce({ code: 1, stdout: "grim failed", stderr: "", timedOut: false })
        .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "", timedOut: false });

      const result = await captureScreenshot("/tmp/uploads", {
        conversationId: "conv-456",
      });

      expect(result).toContain("conv-456");
      expect(mockRunProcess).toHaveBeenCalledTimes(2);

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should generate unique filename with timestamp", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin" });

      mockRunProcess.mockResolvedValue({ code: 0, stdout: "", stderr: "", timedOut: false });

      const result1 = await captureScreenshot("/tmp/uploads", {
        conversationId: "conv-123",
      });

      // Wait a bit to get different timestamp
      await new Promise((r) => setTimeout(r, 1100));

      const result2 = await captureScreenshot("/tmp/uploads", {
        conversationId: "conv-123",
      });

      // Filenames should be different due to timestamp
      expect(result1).not.toBe(result2);

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });
  });
});
