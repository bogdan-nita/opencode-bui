import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { routeInbound } from "./command-router";
import { AgentStoreService, ClockService, OpenCodeClientService, SessionStoreService } from "@runtime/services";

describe("command router", () => {
  it("responds to /pid", async () => {
    const program = routeInbound({
      bridgeId: "telegram",
      conversation: { bridgeId: "telegram", channelId: "1" },
      channel: { id: "1", kind: "dm" },
      user: { id: "99" },
      receivedAtUnixSeconds: 100,
      event: {
        type: "slash",
        command: "pid",
        args: "",
        raw: "/pid",
      },
    });

    const provided = Effect.provideService(
      Effect.provideService(
        Effect.provideService(
          Effect.provideService(program, SessionStoreService, {
            async getSessionByConversation() {
              return undefined;
            },
            async setSessionForConversation() {
              return;
            },
            async getConversationBySessionID() {
              return undefined;
            },
            async clearSessionForConversation() {
              return;
            },
            async setSessionCwd() {
              return;
            },
            async getSessionCwd() {
              return undefined;
            },
          }),
          AgentStoreService,
          {
            async list() {
              return [];
            },
            async save() {
              return;
            },
            async get() {
              return undefined;
            },
          },
        ),
        OpenCodeClientService,
        {
          async createSession() {
            return { sessionId: "s1", text: "ready" };
          },
          async runPrompt() {
            return { sessionId: "s1", text: "ok" };
          },
          async runCommand() {
            return { sessionId: "s1", text: "ok" };
          },
        },
      ),
      ClockService,
      {
        nowUnixSeconds() {
          return 123;
        },
        nowIso() {
          return "2026-01-01T00:00:00.000Z";
        },
      },
    );

    const result = await Effect.runPromise(provided);
    expect(result[0]?.text).toContain("BUI PID");
  });
});
