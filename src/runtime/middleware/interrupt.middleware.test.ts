import { describe, expect, it } from "vitest";
import { isInterruptEvent } from "./interrupt.middleware";
import type { InboundEnvelope } from "@runtime/bridge/types";

function createEnvelope(event: InboundEnvelope["event"]): InboundEnvelope {
  return {
    bridgeId: "telegram",
    conversation: { bridgeId: "telegram", channelId: "1" },
    channel: { id: "1", kind: "dm" },
    user: { id: "1" },
    receivedAtUnixSeconds: Date.now(),
    event,
  };
}

describe("interrupt.middleware", () => {
  describe("isInterruptEvent", () => {
    it("returns true for slash interrupt command", () => {
      const envelope = createEnvelope({ type: "slash", command: "interrupt", args: "", raw: "/interrupt" });
      expect(isInterruptEvent(envelope)).toBe(true);
    });

    it("returns true for slash interupt command (typo variant)", () => {
      const envelope = createEnvelope({ type: "slash", command: "interupt", args: "", raw: "/interupt" });
      expect(isInterruptEvent(envelope)).toBe(true);
    });

    it("returns true for text /interrupt command", () => {
      const envelope = createEnvelope({ type: "text", text: "/interrupt" });
      expect(isInterruptEvent(envelope)).toBe(true);
    });

    it("returns true for text /interupt command (typo variant)", () => {
      const envelope = createEnvelope({ type: "text", text: "/interupt" });
      expect(isInterruptEvent(envelope)).toBe(true);
    });

    it("returns false for other slash commands", () => {
      const envelope = createEnvelope({ type: "slash", command: "start", args: "", raw: "/start" });
      expect(isInterruptEvent(envelope)).toBe(false);
    });

    it("returns false for text without command", () => {
      const envelope = createEnvelope({ type: "text", text: "hello" });
      expect(isInterruptEvent(envelope)).toBe(false);
    });

    it("returns false for button event", () => {
      const envelope = createEnvelope({ type: "button", actionId: "test" });
      expect(isInterruptEvent(envelope)).toBe(false);
    });

    it("returns false for media event", () => {
      const envelope = createEnvelope({ type: "media", mediaKind: "image", fileId: "123" });
      expect(isInterruptEvent(envelope)).toBe(false);
    });
  });
});
