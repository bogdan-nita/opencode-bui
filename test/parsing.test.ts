import { describe, expect, it } from "vitest";
import { isSlashCommand, splitCommand, splitLongText } from "../src/bridge/utils/bridge.utils";
import { buildTextInbound } from "../src/bridge/adapters/telegram/telegram.utils";

describe("command parsing", () => {
  it("detects slash command", () => {
    expect(isSlashCommand("/new foo")).toBe(true);
    expect(isSlashCommand("hello")).toBe(false);
  });

  it("splits slash command and args", () => {
    expect(splitCommand("/new ~/Desktop/workspace")).toEqual({
      command: "new",
      args: "~/Desktop/workspace",
    });
  });

  it("builds slash inbound envelope", () => {
    const inbound = buildTextInbound({
      chatId: 123,
      userId: 999,
      text: "/help now",
      unixSeconds: 100,
    });
    expect(inbound.event.type).toBe("slash");
  });
});

describe("split long text", () => {
  it("keeps short strings as one chunk", () => {
    expect(splitLongText("hello", 10)).toEqual(["hello"]);
  });

  it("splits long strings", () => {
    const value = "a".repeat(25);
    const chunks = splitLongText(value, 10);
    expect(chunks.length).toBe(3);
    expect(chunks.join("")).toBe(value);
  });
});
