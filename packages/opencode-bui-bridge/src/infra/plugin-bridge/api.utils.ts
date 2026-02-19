import { ORPCError, os, type RouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { z } from "zod";

export const pluginBridgeSendPayloadSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().optional(),
  attachments: z.array(z.object({
    filePath: z.string().min(1),
    kind: z.enum(["image", "audio", "video", "document"]).optional(),
    caption: z.string().optional(),
  })).optional(),
});

export type PluginBridgeSendPayload = z.infer<typeof pluginBridgeSendPayloadSchema>;

type SendResult =
  | { ok: true }
  | { ok: false; status: 404 | 500; error: string };

const base = os.$context<{
  token: string;
  requestToken?: string;
}>();

const authorized = base.use(async ({ context, next }) => {
  if (!context.requestToken || context.requestToken !== context.token) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next();
});

export function createPluginBridgeRouter(input: {
  onSend: (payload: PluginBridgeSendPayload) => Promise<SendResult>;
}) {
  return {
    plugin: {
      health: base.handler(async () => ({ ok: true as const })),
      send: authorized
        .input(pluginBridgeSendPayloadSchema)
        .handler(async ({ input: payload }) => {
          const result = await input.onSend(payload);
          if (!result.ok) {
            if (result.status === 404) {
              throw new ORPCError("NOT_FOUND", { message: result.error });
            }
            throw new ORPCError("INTERNAL_SERVER_ERROR", { message: result.error });
          }
          return { ok: true as const };
        }),
    },
  };
}

export type PluginBridgeRouter = ReturnType<typeof createPluginBridgeRouter>;
export type PluginBridgeClient = RouterClient<PluginBridgeRouter>;

export function createPluginBridgeHandler(input: {
  token: string;
  onSend: (payload: PluginBridgeSendPayload) => Promise<SendResult>;
}) {
  const router = createPluginBridgeRouter({ onSend: input.onSend });
  const handler = new RPCHandler(router);

  return {
    router,
    async handle(request: Request): Promise<Response | undefined> {
      if (new URL(request.url).pathname === "/health") {
        return Response.json({ ok: true });
      }

      const { matched, response } = await handler.handle(request, {
        prefix: "/rpc",
        context: (() => {
          const requestToken = request.headers.get("x-bui-token")?.trim();
          return requestToken
            ? { token: input.token, requestToken }
            : { token: input.token };
        })(),
      });
      if (!matched) {
        return undefined;
      }
      return response;
    },
  };
}
