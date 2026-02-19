import { Hono } from "hono";
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

export function createPluginBridgeApp(input: {
  token: string;
  onSend: (payload: PluginBridgeSendPayload) => Promise<SendResult>;
}) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/v1/plugin/send", async (c) => {
    const authHeader = c.req.header("x-bui-token")?.trim();
    if (authHeader !== input.token) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "invalid json" }, 400);
    }

    const parsed = pluginBridgeSendPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: "invalid payload" }, 400);
    }

    const result = await input.onSend(parsed.data);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, result.status);
    }

    return c.json({ ok: true });
  });

  return app;
}

export type PluginBridgeAppType = ReturnType<typeof createPluginBridgeApp>;
