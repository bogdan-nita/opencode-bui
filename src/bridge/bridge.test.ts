import { describe, expect, it } from "vitest";
import { bridgeCapabilitiesSchema, conversationRefSchema } from "./types/bridge.schema";
import { splitCommand, splitLongText } from "./utils/bridge.utils";

describe("bridge domain", () => {
  it("parses conversation ref", () => {
    const parsed = conversationRefSchema.parse({ bridgeId: "telegram", channelId: "123" });
    expect(parsed.bridgeId).toBe("telegram");
  });

  it("parses capabilities", () => {
    const parsed = bridgeCapabilitiesSchema.parse({
      slashCommands: true,
      buttons: true,
      mediaUpload: true,
      mediaDownload: true,
      messageEdit: false,
      threads: false,
      markdown: "limited",
    });
    expect(parsed.markdown).toBe("limited");
  });

  it("splits slash command text", () => {
    expect(splitCommand("/new ~/Desktop")).toEqual({ command: "new", args: "~/Desktop" });
  });

  it("splits long text into chunks", () => {
    const chunks = splitLongText("a".repeat(30), 10);
    expect(chunks.length).toBe(3);
  });
});
