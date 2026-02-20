import { beforeEach, describe, expect, it, vi } from "vitest";

const createORPCClientMock = vi.fn();
const rpcLinkMock = vi.fn();

vi.mock("@orpc/client", () => ({
  createORPCClient: createORPCClientMock,
}));

vi.mock("@orpc/client/fetch", () => ({
  RPCLink: rpcLinkMock,
}));

describe("plugin bridge client", () => {
  beforeEach(() => {
    createORPCClientMock.mockReset();
    rpcLinkMock.mockReset();
    rpcLinkMock.mockImplementation((options: unknown) => ({ options }));
    createORPCClientMock.mockImplementation((link: unknown) => ({ link }));
  });

  it("builds RPC client with normalized url and token header", async () => {
    const { createPluginBridgeClient } = await import("./client");

    const client = createPluginBridgeClient({
      url: "http://127.0.0.1:4499///",
      token: "secret-token",
    });

    expect(rpcLinkMock).toHaveBeenCalledWith({
      url: "http://127.0.0.1:4499/rpc",
      headers: {
        "x-bui-token": "secret-token",
      },
    });
    expect(createORPCClientMock).toHaveBeenCalledTimes(1);
    expect(client).toEqual({
      link: {
        options: {
          url: "http://127.0.0.1:4499/rpc",
          headers: {
            "x-bui-token": "secret-token",
          },
        },
      },
    });
  });
});
