import { describe, expect, it } from "vitest";
import { buildTextInbound, createConversation } from "./telegram.utils";

describe("telegram utils", () => {
  it("builds conversation with telegram bridge id", () => {
    expect(createConversation("42")).toEqual({
      bridgeId: "telegram",
      channelId: "42",
    });
  });

  it("parses slash inbound event", () => {
    const envelope = buildTextInbound({
      chatId: 123,
      userId: 7,
      username: "alice",
      text: "/permit 42",
      unixSeconds: 100,
    });

    expect(envelope.event).toEqual({
      type: "slash",
      command: "permit",
      args: "42",
      raw: "/permit 42",
    });
    expect(envelope.user.username).toBe("alice");
  });
});
