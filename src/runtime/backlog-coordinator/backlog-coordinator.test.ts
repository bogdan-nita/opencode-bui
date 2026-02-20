import { describe, expect, it } from "vitest";
import { chooseBacklogMessages, isBacklogMessage } from "./backlog-coordinator";
import type { InboundEnvelope } from "@runtime/bridge/types";

describe("backlog coordinator", () => {
  it("flags stale messages by threshold", () => {
    expect(isBacklogMessage(100, 120, 10)).toBe(true);
    expect(isBacklogMessage(110, 120, 10)).toBe(false);
  });

  it("chooses latest or all messages based on decision", () => {
    const messages: InboundEnvelope[] = [
      {
        bridgeId: "telegram",
        conversation: { bridgeId: "telegram", channelId: "1" },
        channel: { id: "1", kind: "dm" },
        user: { id: "u1" },
        receivedAtUnixSeconds: 100,
        event: { type: "text", text: "a" },
      },
      {
        bridgeId: "telegram",
        conversation: { bridgeId: "telegram", channelId: "1" },
        channel: { id: "1", kind: "dm" },
        user: { id: "u1" },
        receivedAtUnixSeconds: 101,
        event: { type: "text", text: "b" },
      },
    ];

    expect(chooseBacklogMessages(messages, "all")).toHaveLength(2);
    expect(chooseBacklogMessages(messages, "latest")).toEqual([messages[1]]);
    expect(chooseBacklogMessages(messages, "ignore")).toEqual([]);
  });
});
