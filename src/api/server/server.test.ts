import { describe, expect, it, vi } from "vitest";
import { createPluginBridgeHandler } from "./server";

describe("plugin bridge server", () => {
  it("responds on health endpoint", async () => {
    const handler = createPluginBridgeHandler({
      token: "secret",
      onSend: async () => ({ ok: true }),
    });

    const response = await handler.handle(new Request("http://127.0.0.1/health"));
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ ok: true });
  });

  it("rejects unauthorized plugin send", async () => {
    const onSend = vi.fn(async () => ({ ok: true as const }));
    const handler = createPluginBridgeHandler({ token: "secret", onSend });

    const response = await handler.handle(new Request("http://127.0.0.1/rpc/plugin/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { sessionId: "ses_1", text: "hello" } }),
    }));

    expect(response?.status).toBe(401);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("accepts authorized plugin send and forwards payload", async () => {
    const onSend = vi.fn(async () => ({ ok: true as const }));
    const handler = createPluginBridgeHandler({ token: "secret", onSend });

    const response = await handler.handle(new Request("http://127.0.0.1/rpc/plugin/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bui-token": "secret",
      },
      body: JSON.stringify({
        json: {
          sessionId: "ses_1",
          text: "hello",
          attachments: [{ filePath: "/tmp/a.txt", kind: "document", caption: "A" }],
        },
      }),
    }));

    expect(response?.status).toBe(200);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({
      sessionId: "ses_1",
      text: "hello",
      attachments: [{ filePath: "/tmp/a.txt", kind: "document", caption: "A" }],
    });
  });

  it("maps upstream not found and internal errors", async () => {
    const notFoundHandler = createPluginBridgeHandler({
      token: "secret",
      onSend: async () => ({ ok: false, status: 404, error: "session not found" }),
    });
    const internalHandler = createPluginBridgeHandler({
      token: "secret",
      onSend: async () => ({ ok: false, status: 500, error: "unexpected" }),
    });

    const notFoundResponse = await notFoundHandler.handle(new Request("http://127.0.0.1/rpc/plugin/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bui-token": "secret",
      },
      body: JSON.stringify({ json: { sessionId: "ses_404" } }),
    }));

    const internalResponse = await internalHandler.handle(new Request("http://127.0.0.1/rpc/plugin/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bui-token": "secret",
      },
      body: JSON.stringify({ json: { sessionId: "ses_500" } }),
    }));

    expect(notFoundResponse?.status).toBe(404);
    expect(internalResponse?.status).toBe(500);
  });

  it("returns undefined for non-rpc route", async () => {
    const handler = createPluginBridgeHandler({ token: "secret", onSend: async () => ({ ok: true }) });
    const response = await handler.handle(new Request("http://127.0.0.1/not-rpc", { method: "POST" }));
    expect(response).toBeUndefined();
  });
});
