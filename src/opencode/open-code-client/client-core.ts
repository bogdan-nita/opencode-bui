import { createOpencode, createOpencodeClient, type OpencodeClient, type Part } from "@opencode-ai/sdk";
import { logger } from "@runtime/logger";
import type { OutboundAttachment } from "@bridge/envelope.types";
import type { OpenCodeClient } from "@bridge/open-code-client.types";
import type {
  ClientBootstrapOptions,
  SdkContext,
  InstanceState,
  RunPromptStreamInput,
  RunPromptStreamResult,
} from "./client.types";
import {
  shouldInjectBridgeToolPrompt,
  buildBridgeToolsPreamble,
  errorToString,
  resolveAttachment,
  formatToolActivity,
  eventSessionId,
  normalizeEvent,
  extractPermissionRequest,
  parseBridgeAttachmentDirectives,
} from "./client.utils";

/** Create an SDK context by starting or attaching to an OpenCode server */
async function createSdkContext(options: ClientBootstrapOptions): Promise<SdkContext> {
  if (options.attachUrl) {
    logger.info({ url: options.attachUrl }, "[bui] Using SDK client against existing OpenCode server.");
    return { client: createOpencodeClient({ baseUrl: options.attachUrl }) };
  }

  const configuredPort = Number.parseInt(process.env.BUI_OPENCODE_SERVER_PORT || "", 10);
  const ports = Number.isFinite(configuredPort)
    ? [configuredPort]
    : [4096, ...Array.from({ length: 4 }, () => 10000 + Math.floor(Math.random() * 40000))];

  let lastError: string | undefined;
  for (const port of ports) {
    try {
      logger.info({ port }, "[bui] Starting embedded OpenCode SDK server.");
      const opencode = await createOpencode({ hostname: "127.0.0.1", port });
      const close = () => {
        try {
          opencode.server.close();
        } catch {
          return;
        }
      };

      process.once("exit", close);
      return {
        client: opencode.client,
        pid: process.pid,
        close,
      };
    } catch (error) {
      const message = errorToString(error);
      lastError = message;
      const canRetry = message.includes("Failed to start server on port") || message.includes("EADDRINUSE");
      logger.warn({ port, error: message }, "[bui] Embedded OpenCode server start failed.");
      if (!canRetry) {
        break;
      }
    }
  }

  throw new Error(lastError || "Failed to start embedded OpenCode SDK server.");
}

/** Create the OpenCode client with instance management and API methods */
export function createOpenCodeClient(options: ClientBootstrapOptions): OpenCodeClient {
  const instances = new Map<string, InstanceState>();

  const defaultConversationKey = "__default__";
  const idleSecondsRaw = Number.parseInt(process.env.BUI_OPENCODE_INSTANCE_IDLE_SECONDS || "900", 10);
  const idleSeconds = Number.isFinite(idleSecondsRaw) && idleSecondsRaw > 0 ? idleSecondsRaw : 900;

  const stopInstance = async (conversationKey: string) => {
    const instance = instances.get(conversationKey);
    if (!instance) {
      return;
    }
    instances.delete(conversationKey);
    if (instance.idleTimer) {
      clearTimeout(instance.idleTimer);
    }
    try {
      const context = await instance.contextPromise;
      context.close?.();
      logger.info({ conversationKey, pid: context.pid }, "[bui] OpenCode instance stopped due to inactivity.");
    } catch {
      return;
    }
  };

  const touchInstance = (conversationKey: string) => {
    const instance = instances.get(conversationKey);
    if (!instance) {
      return;
    }
    instance.lastActiveUnixSeconds = Math.floor(Date.now() / 1000);
    if (instance.idleTimer) {
      clearTimeout(instance.idleTimer);
    }
    instance.idleTimer = setTimeout(() => {
      const current = instances.get(conversationKey);
      if (!current) {
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      if (now - current.lastActiveUnixSeconds < idleSeconds) {
        touchInstance(conversationKey);
        return;
      }
      void stopInstance(conversationKey);
    }, idleSeconds * 1000);
  };

  const ensureContext = async (conversationKey: string = defaultConversationKey): Promise<SdkContext> => {
    const existing = instances.get(conversationKey);
    if (existing) {
      touchInstance(conversationKey);
      logger.info({ conversationKey }, "[bui] Reusing existing OpenCode SDK context.");
      return await existing.contextPromise;
    }

    const startedAt = Date.now();
    const contextPromise = createSdkContext(options)
      .then((context) => {
        logger.info({ conversationKey, startupMs: Date.now() - startedAt, pid: context.pid }, "[bui] OpenCode SDK context ready.");
        return context;
      })
      .catch((error) => {
        instances.delete(conversationKey);
        throw error;
      });

    instances.set(conversationKey, {
      contextPromise,
      lastActiveUnixSeconds: Math.floor(Date.now() / 1000),
      bridgeGuidanceSeededSessions: new Set<string>(),
    });
    touchInstance(conversationKey);
    return await contextPromise;
  };

  const ensureSession = async (
    conversationKey: string,
    client: OpencodeClient,
    cwd: string | undefined,
    sessionId: string | undefined,
  ): Promise<string> => {
    if (sessionId) {
      try {
        await client.session.get({
          path: { id: sessionId },
          ...(cwd ? { query: { directory: cwd } } : {}),
          throwOnError: true,
        });
        return sessionId;
      } catch {
        logger.warn({ conversationKey, sessionId }, "[bui] Stored session not found on conversation instance; creating a new session.");
      }
    }

    const created = await client.session.create({
      ...(cwd ? { query: { directory: cwd } } : {}),
      throwOnError: true,
    });
    const id = created.data?.id;
    if (!id) {
      throw new Error("SDK failed to create OpenCode session.");
    }
    return id;
  };

  const runPromptStream = async (input: RunPromptStreamInput): Promise<RunPromptStreamResult> => {
    const injectBridgeToolsPrompt = shouldInjectBridgeToolPrompt();
    const { client } = await ensureContext(input.conversationKey);
    const cwd = input.cwd;
    let resolvedCwd = cwd || process.cwd();
    logger.info({ conversationKey: input.conversationKey, cwd: cwd || "default", hasSession: Boolean(input.sessionId) }, "[bui] Starting OpenCode prompt stream.");
    const sid = await ensureSession(input.conversationKey, client, cwd, input.sessionId);
    logger.info({ conversationKey: input.conversationKey, sessionId: sid }, "[bui] OpenCode session resolved.");
    const eventStream = await client.event.subscribe({
      ...(cwd ? { query: { directory: cwd } } : {}),
      throwOnError: true,
    });

    const instance = instances.get(input.conversationKey);
    const shouldInjectPromptGuidance = injectBridgeToolsPrompt && instance ? !instance.bridgeGuidanceSeededSessions.has(sid) : false;
    const promptText = shouldInjectPromptGuidance
      ? `${buildBridgeToolsPreamble()}\n\nUser request:\n${input.prompt}`
      : input.prompt;

    if (shouldInjectPromptGuidance && instance) {
      instance.bridgeGuidanceSeededSessions.add(sid);
      logger.info({ conversationKey: input.conversationKey, sessionId: sid }, "[bui] Injected one-time bridge tool guidance for session.");
    }

    await client.session.promptAsync({
      path: { id: sid },
      ...(cwd ? { query: { directory: cwd } } : {}),
      body: {
        parts: [{ type: "text", text: promptText }],
      },
      throwOnError: true,
    });
    logger.info({ conversationKey: input.conversationKey, sessionId: sid }, "[bui] Prompt submitted to OpenCode.");

    const activity: string[] = [];
    const textPartsByMessageId = new Map<string, Map<string, string>>();
    const assistantMessageIds: string[] = [];
    const attachments = new Map<string, OutboundAttachment>();
    const runningTools = new Map<string, string>();

    const iterator = eventStream.stream[Symbol.asyncIterator]();
    const timeoutMs = Number.parseInt(process.env.BUI_OPENCODE_STREAM_TIMEOUT_MS || "180000", 10);
    while (true) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const next = await Promise.race([
        iterator.next(),
        new Promise<"timeout">((resolveTimeout) => {
          timeoutHandle = setTimeout(() => resolveTimeout("timeout"), timeoutMs);
        }),
      ]);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (next === "timeout") {
        logger.error({ conversationKey: input.conversationKey, sessionId: sid, timeoutMs }, "[bui] OpenCode event stream timed out waiting for events.");
        await client.session.abort({
          path: { id: sid },
          ...(cwd ? { query: { directory: cwd } } : {}),
          throwOnError: true,
        });
        throw new Error(`OpenCode event stream timed out after ${timeoutMs}ms`);
      }

      if (next.done) {
        logger.warn({ conversationKey: input.conversationKey, sessionId: sid }, "[bui] OpenCode event stream ended before session.idle.");
        break;
      }

      const payload = normalizeEvent(next.value);
      if (!payload) {
        continue;
      }

      logger.info({ conversationKey: input.conversationKey, sessionId: sid, eventType: payload.type }, "[bui] OpenCode event received.");

      if (input.signal?.aborted) {
        await client.session.abort({
          path: { id: sid },
          ...(cwd ? { query: { directory: cwd } } : {}),
          throwOnError: true,
        });
        throw new Error("OpenCode run interrupted.");
      }

      const payloadSessionId = eventSessionId(payload as { type: string; properties?: Record<string, unknown> });
      if (payloadSessionId && payloadSessionId !== sid) {
        continue;
      }

      if (payload.type === "message.updated") {
        const info = payload.properties?.info as { id?: string; role?: string; path?: { cwd?: string } } | undefined;
        if (info?.role === "assistant" && typeof info.id === "string" && !assistantMessageIds.includes(info.id)) {
          assistantMessageIds.push(info.id);
        }
        if (typeof info?.path?.cwd === "string" && info.path.cwd.length > 0) {
          resolvedCwd = info.path.cwd;
        }
      }

      if (payload.type === "message.part.updated") {
        const properties = payload.properties as { part?: Part; delta?: string };
        const part = properties.part;
        if (!part) {
          continue;
        }

        if (part.type === "text") {
          const messageId = part.messageID || "unknown";
          const messageParts = textPartsByMessageId.get(messageId) || new Map<string, string>();
          if (!textPartsByMessageId.has(messageId)) {
            textPartsByMessageId.set(messageId, messageParts);
          }
          messageParts.set(part.id, part.text || properties.delta || "");
          continue;
        }

        if (part.type === "tool") {
          const line = formatToolActivity(part);
          const previous = runningTools.get(part.id);
          if (previous !== line) {
            runningTools.set(part.id, line);
            activity.push(line);
            if (input.onActivity) {
              await input.onActivity(line);
            }
          }
          continue;
        }

        if (part.type === "step-start") {
          const line = "step started";
          activity.push(line);
          if (input.onActivity) {
            await input.onActivity(line);
          }
          continue;
        }

        if (part.type === "step-finish") {
          const inputTokens = part.tokens?.input ?? 0;
          const outputTokens = part.tokens?.output ?? 0;
          const reasoningTokens = part.tokens?.reasoning ?? 0;
          const totalTokens = inputTokens + outputTokens + reasoningTokens;
          const line = `step finished (${part.reason}, tokens=${totalTokens})`;
          activity.push(line);
          if (input.onActivity) {
            await input.onActivity(line);
          }
          continue;
        }

        if (part.type === "file" && part.source?.type === "file") {
          const resolved = await resolveAttachment(part.source.path, resolvedCwd, part.mime);
          if (resolved) {
            attachments.set(resolved.filePath, resolved);
          }
        }

        continue;
      }

      const permission = extractPermissionRequest(payload);
      if (permission) {
        logger.info({ conversationKey: input.conversationKey, sessionId: sid, permission }, "[bui] Parsed OpenCode permission request.");
        const line = `permission: ${permission.title}`;
        activity.push(line);
        if (input.onActivity) {
          await input.onActivity(line);
        }

        if (input.onPermissionRequest) {
          logger.info({ conversationKey: input.conversationKey, sessionId: sid, permissionId: permission.id }, "[bui] Emitting permission request to runtime bridge layer.");
          const response = await input.onPermissionRequest({
            id: permission.id,
            sessionId: permission.sessionId,
            title: permission.title,
            type: permission.type,
            ...(permission.pattern ? { pattern: permission.pattern } : {}),
            ...(permission.details ? { details: permission.details } : {}),
          });
          logger.info({ conversationKey: input.conversationKey, sessionId: sid, permissionId: permission.id, response }, "[bui] Submitting permission response.");
          try {
            await client.postSessionIdPermissionsPermissionId({
              path: { id: permission.sessionId, permissionID: permission.id },
              ...(cwd ? { query: { directory: cwd } } : {}),
              body: { response },
              throwOnError: true,
            });
            logger.info({ conversationKey: input.conversationKey, sessionId: sid, permissionId: permission.id }, "[bui] Permission response accepted by OpenCode.");
          } catch (error) {
            logger.error({ conversationKey: input.conversationKey, sessionId: sid, permissionId: permission.id, error: errorToString(error), rawError: error }, "[bui] Permission response submission failed.");
            throw error;
          }
        }

        continue;
      }

      if (payload.type === "session.error") {
        const message = (payload.properties as { error?: { data?: { message?: string } } }).error?.data?.message || "Unknown session error";
        throw new Error(message);
      }

      if (payload.type === "session.idle") {
        logger.info({ conversationKey: input.conversationKey, sessionId: sid }, "[bui] OpenCode session became idle.");
        break;
      }
    }

    const latestAssistantMessageId = assistantMessageIds[assistantMessageIds.length - 1];
    const targetParts = latestAssistantMessageId ? textPartsByMessageId.get(latestAssistantMessageId) : undefined;
    let text = targetParts
      ? [...targetParts.values()].join("").trim()
      : [...textPartsByMessageId.values()].flatMap((parts) => [...parts.values()]).join("").trim();

    const directiveParse = parseBridgeAttachmentDirectives(text);
    text = directiveParse.cleanText;
    if (directiveParse.directives.length > 0) {
      logger.info({ conversationKey: input.conversationKey, sessionId: sid, directiveCount: directiveParse.directives.length }, "[bui] Parsed bridge attachment directives.");
    }

    for (const directive of directiveParse.directives) {
      const resolved = await resolveAttachment(directive.pathLike, resolvedCwd);
      if (resolved) {
        const withCaption = directive.caption
          ? { ...resolved, caption: directive.caption }
          : resolved;
        attachments.set(resolved.filePath, withCaption);
        logger.info({ conversationKey: input.conversationKey, sessionId: sid, filePath: resolved.filePath, source: "bridge-directive" }, "[bui] Collected attachment from bridge directive.");
      } else {
        logger.warn({ conversationKey: input.conversationKey, sessionId: sid, directivePath: directive.pathLike }, "[bui] Bridge attachment directive path could not be resolved.");
      }
    }

    logger.info({ conversationKey: input.conversationKey, sessionId: sid, textChars: text.length, activityCount: activity.length, attachmentCount: attachments.size }, "[bui] OpenCode prompt stream completed.");

    touchInstance(input.conversationKey);

    return {
      sessionId: sid,
      text,
      ...(activity.length > 0 ? { activity } : {}),
      ...(attachments.size > 0 ? { attachments: [...attachments.values()] } : {}),
    };
  };

  return {
    async warmup(conversationKey) {
      await ensureContext(conversationKey || defaultConversationKey);
    },
    async createSession(input) {
      const { client } = await ensureContext(input.conversationKey);
      const sid = await ensureSession(input.conversationKey, client, input.cwd, undefined);
      logger.info({ conversationKey: input.conversationKey, sessionId: sid }, "[bui] OpenCode session created.");
      touchInstance(input.conversationKey);
      return { sessionId: sid, text: "ready" };
    },
    async runPrompt(input) {
      return await runPromptStream(input);
    },
    async runCommand(input) {
      return await runPromptStream({
        conversationKey: input.conversationKey,
        prompt: `/${input.command}${input.args ? ` ${input.args}` : ""}`,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.onActivity ? { onActivity: input.onActivity } : {}),
        ...(input.onPermissionRequest ? { onPermissionRequest: input.onPermissionRequest } : {}),
      });
    },
    async getInstanceInfo(conversationKey) {
      const instance = instances.get(conversationKey);
      if (!instance) {
        return { lastActiveUnixSeconds: 0 };
      }
      const context = await instance.contextPromise;
      return {
        ...(context.pid ? { pid: context.pid } : {}),
        lastActiveUnixSeconds: instance.lastActiveUnixSeconds,
      };
    },
  };
}
