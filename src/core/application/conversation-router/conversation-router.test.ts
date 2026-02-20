import { describe, expect, it } from "vitest";
import { conversationKey } from "./conversation-router";

describe("conversation router", () => {
  it("builds key without thread", () => {
    expect(conversationKey({ bridgeId: "telegram", channelId: "42" })).toBe("telegram:42");
  });

  it("builds key with thread", () => {
    expect(conversationKey({ bridgeId: "discord", channelId: "100", threadId: "200" })).toBe("discord:100:200");
  });
});
