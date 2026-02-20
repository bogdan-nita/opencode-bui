import { describe, expect, it, vi } from "vitest";
import { createSystemClock } from "./system-clock";

describe("system clock", () => {
  it("returns unix seconds based on Date.now", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_725_000_123_456);
    try {
      const clock = createSystemClock();
      expect(clock.nowUnixSeconds()).toBe(1_725_000_123);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("returns ISO timestamp", () => {
    const clock = createSystemClock();
    const value = clock.nowIso();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
