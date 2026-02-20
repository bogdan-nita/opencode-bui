import { describe, expect, it } from "vitest";
import { parseSlashCommand, parsePermissionResponseFromText } from "./slash-command.middleware";
import type { InboundEnvelope } from "@bridge/types";

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

describe("slash-command.middleware", () => {
  describe("parseSlashCommand", () => {
    it("parses slash event", () => {
      const envelope = createEnvelope({ type: "slash", command: "start", args: "", raw: "/start" });
      const result = parseSlashCommand(envelope);
      expect(result).toEqual({ command: "start", args: "" });
    });

    it("parses slash event with args", () => {
      const envelope = createEnvelope({ type: "slash", command: "permit", args: "once abc123", raw: "/permit once abc123" });
      const result = parseSlashCommand(envelope);
      expect(result).toEqual({ command: "permit", args: "once abc123" });
    });

    it("normalizes command to lowercase", () => {
      const envelope = createEnvelope({ type: "slash", command: "START", args: "", raw: "/START" });
      const result = parseSlashCommand(envelope);
      expect(result).toEqual({ command: "start", args: "" });
    });

    it("strips @botname suffix", () => {
      const envelope = createEnvelope({ type: "slash", command: "start@mybot", args: "", raw: "/start@mybot" });
      const result = parseSlashCommand(envelope);
      expect(result).toEqual({ command: "start", args: "" });
    });

    it("parses text command starting with /", () => {
      const envelope = createEnvelope({ type: "text", text: "/start" });
      const result = parseSlashCommand(envelope);
      expect(result).toEqual({ command: "start", args: "" });
    });

    it("parses text command with args", () => {
      const envelope = createEnvelope({ type: "text", text: "/permit once abc123" });
      const result = parseSlashCommand(envelope);
      expect(result).toEqual({ command: "permit", args: "once abc123" });
    });

    it("returns undefined for text without /", () => {
      const envelope = createEnvelope({ type: "text", text: "hello world" });
      const result = parseSlashCommand(envelope);
      expect(result).toBeUndefined();
    });

    it("returns undefined for button event", () => {
      const envelope = createEnvelope({ type: "button", actionId: "test" });
      const result = parseSlashCommand(envelope);
      expect(result).toBeUndefined();
    });
  });

  describe("parsePermissionResponseFromText", () => {
    it("parses permit once with id", () => {
      const envelope = createEnvelope({ type: "text", text: "/permit once abc123" });
      const result = parsePermissionResponseFromText(envelope);
      expect(result).toEqual({ permissionId: "abc123", response: "once" });
    });

    it("parses permit always with id", () => {
      const envelope = createEnvelope({ type: "text", text: "/permit always xyz789" });
      const result = parsePermissionResponseFromText(envelope);
      expect(result).toEqual({ permissionId: "xyz789", response: "always" });
    });

    it("parses permit reject with id", () => {
      const envelope = createEnvelope({ type: "text", text: "/permit reject test123" });
      const result = parsePermissionResponseFromText(envelope);
      expect(result).toEqual({ permissionId: "test123", response: "reject" });
    });

    it("parses permit without id (uses fallback)", () => {
      const envelope = createEnvelope({ type: "text", text: "/permit once" });
      const result = parsePermissionResponseFromText(envelope);
      expect(result).toEqual({ response: "once" });
    });

    it("parses allow command (alias)", () => {
      const envelope = createEnvelope({ type: "text", text: "/allow once abc123" });
      const result = parsePermissionResponseFromText(envelope);
      expect(result).toEqual({ permissionId: "abc123", response: "once" });
    });

    it("parses permission command (alias)", () => {
      const envelope = createEnvelope({ type: "text", text: "/permission once abc123" });
      const result = parsePermissionResponseFromText(envelope);
      expect(result).toEqual({ permissionId: "abc123", response: "once" });
    });

    it("returns undefined for non-permit command", () => {
      const envelope = createEnvelope({ type: "text", text: "/start" });
      const result = parsePermissionResponseFromText(envelope);
      expect(result).toBeUndefined();
    });

    it("returns undefined for invalid response", () => {
      const envelope = createEnvelope({ type: "text", text: "/permit invalid abc123" });
      const result = parsePermissionResponseFromText(envelope);
      expect(result).toBeUndefined();
    });

    it("returns undefined for text without command", () => {
      const envelope = createEnvelope({ type: "text", text: "hello" });
      const result = parsePermissionResponseFromText(envelope);
      expect(result).toBeUndefined();
    });
  });
});
