import { ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { PLUGIN_BRIDGE_HEALTH_PATH, PLUGIN_BRIDGE_RPC_PATH, PLUGIN_BRIDGE_TOKEN_HEADER } from "./plugin-bridge.consts";
import { pluginBridgeSendPayloadSchema } from "./api.schema";
import type { PluginBridgeSendPayload, PluginBridgeSendResult } from "./api.types";

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
  onSend: (payload: PluginBridgeSendPayload) => Promise<PluginBridgeSendResult>;
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

export function createPluginBridgeHandler(input: {
  token: string;
  onSend: (payload: PluginBridgeSendPayload) => Promise<PluginBridgeSendResult>;
}) {
  const router = createPluginBridgeRouter({ onSend: input.onSend });
  const handler = new RPCHandler(router);

  return {
    router,
    async handle(request: Request): Promise<Response | undefined> {
      if (new URL(request.url).pathname === PLUGIN_BRIDGE_HEALTH_PATH) {
        return Response.json({ ok: true });
      }

      const { matched, response } = await handler.handle(request, {
        prefix: PLUGIN_BRIDGE_RPC_PATH,
        context: (() => {
          const requestToken = request.headers.get(PLUGIN_BRIDGE_TOKEN_HEADER)?.trim();
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

export { pluginBridgeSendPayloadSchema } from "./api.schema";
export type {
  PluginBridgeClient,
  PluginBridgeRouter,
  PluginBridgeSendPayload,
  PluginBridgeSendResult,
} from "./api.types";
