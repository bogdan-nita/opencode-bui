import { createOpencode, createOpencodeClient, type OpencodeClient, type Part, type ToolPart } from "@opencode-ai/sdk";
import { isAbsolute, resolve } from "node:path";
import { stat } from "node:fs/promises";
import { fileExists } from "@infra/runtime/runtime-fs.utils.js";
import { logger } from "@infra/runtime/logger.utils.js";
import type { OutboundAttachment } from "@core/domain/envelope.types.js";
import type { OpenCodeClient } from "@core/ports/open-code-client.types.js";

type ClientBootstrapOptions = {
  opencodeBin: string;
  attachUrl?: string;
};

type SdkContext = {
  client: OpencodeClient;
  close?: () => void;
};

type OpencodeEvent = {
  type: string;
  properties?: Record<string, unknown>;
};

type BridgeAttachmentDirective = {
  pathLike: string;
  caption?: string;
};

function shouldInjectBridgeToolPrompt(): boolean {
  return process.env.BUI_AGENT_BRIDGE_TOOLS === "1";
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseBridgeAttachmentDirectives(text: string): { cleanText: string; directives: BridgeAttachmentDirective[] } {
  const directives: BridgeAttachmentDirective[] = [];
  const keptLines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.toLowerCase().startsWith("@bui.attach")) {
      keptLines.push(rawLine);
      continue;
    }

    const body = line.slice("@bui.attach".length).trim();
    if (!body) {
      continue;
    }

    const separator = body.indexOf("|");
    const pathLike = stripQuotes(separator >= 0 ? body.slice(0, separator).trim() : body);
    const caption = separator >= 0 ? body.slice(separator + 1).trim() : "";
    if (!pathLike) {
      continue;
    }

    directives.push({
      pathLike,
      ...(caption ? { caption } : {}),
    });
  }

  return {
    cleanText: keptLines.join("\n").trim(),
    directives,
  };
}

function buildBridgeToolsPreamble(): string {
  return [
    "Bridge tool rules (OpenCode BUI):",
    "- To send a file/image/audio/video to the user, emit one line exactly in this format:",
    "  @bui.attach <path> | <optional caption>",
    "- Use absolute paths or paths relative to current working directory.",
    "- Emit attach directives only when the user explicitly asked to receive files/media.",
    "- You may emit multiple @bui.attach lines.",
  ].join("\n");
}

function extractPermissionRequest(payload: OpencodeEvent): {
  id: string;
  sessionId: string;
  title: string;
  type: string;
  pattern?: string;
  details?: string;
  filePathCandidate?: string;
} | undefined {
  if (payload.type !== "permission.updated" && payload.type !== "permission.asked") {
    return undefined;
  }

  const properties = payload.properties || {};
  const directId = properties.id;
  const directSessionId = properties.sessionID;
  const nested = properties.permission && typeof properties.permission === "object"
    ? (properties.permission as Record<string, unknown>)
    : undefined;

  const id = typeof directId === "string" ? directId : typeof nested?.id === "string" ? nested.id : undefined;
  const sessionId =
    typeof directSessionId === "string"
      ? directSessionId
      : typeof nested?.sessionID === "string"
        ? nested.sessionID
        : undefined;
  const titleRaw =
    typeof properties.title === "string"
      ? properties.title
      : typeof nested?.title === "string"
        ? nested.title
        : "permission requested";
  const typeRawCandidate =
    typeof properties.type === "string"
      ? properties.type
      : typeof nested?.type === "string"
        ? nested.type
        : typeof properties["kind"] === "string"
          ? (properties["kind"] as string)
          : typeof nested?.["kind"] === "string"
            ? (nested["kind"] as string)
            : "unknown";
  const patternRaw =
    typeof properties.pattern === "string"
      ? properties.pattern
      : Array.isArray(properties.pattern)
        ? properties.pattern.join(", ")
        : typeof nested?.pattern === "string"
          ? nested.pattern
          : Array.isArray(nested?.pattern)
            ? nested.pattern.join(", ")
            : undefined;
  const metadata =
    properties.metadata && typeof properties.metadata === "object"
      ? (properties.metadata as Record<string, unknown>)
      : nested?.metadata && typeof nested.metadata === "object"
        ? (nested.metadata as Record<string, unknown>)
        : undefined;
  const filePathCandidate =
    typeof metadata?.filepath === "string"
      ? metadata.filepath
      : typeof metadata?.filePath === "string"
        ? metadata.filePath
        : typeof metadata?.path === "string"
          ? metadata.path
          : undefined;
  const metadataTitle = typeof metadata?.title === "string" ? metadata.title : undefined;
  const metadataType = typeof metadata?.type === "string" ? metadata.type : undefined;
  const metadataPattern = typeof metadata?.pattern === "string" ? metadata.pattern : undefined;
  const summaryFields = [
    typeof metadata?.tool === "string" ? `tool=${metadata.tool}` : undefined,
    typeof metadata?.command === "string" ? `command=${metadata.command}` : undefined,
    typeof metadata?.path === "string" ? `path=${metadata.path}` : undefined,
    typeof metadata?.reason === "string" ? `reason=${metadata.reason}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const details =
    summaryFields.length > 0
      ? summaryFields.join(", ")
      : metadata && Object.keys(metadata).length > 0
        ? `metadata=${JSON.stringify(metadata).slice(0, 220)}`
        : undefined;

  const inferredType =
    typeRawCandidate && typeRawCandidate !== "unknown"
      ? typeRawCandidate
      : typeof metadata?.tool === "string"
        ? `tool:${metadata.tool}`
        : typeof metadata?.filepath === "string" || typeof metadata?.filePath === "string"
          ? "filesystem:read"
          : typeof metadata?.path === "string"
            ? "filesystem"
            : "unknown";

  const inferredTitle =
    titleRaw && titleRaw !== "permission requested"
      ? titleRaw
      : typeof metadata?.filepath === "string"
        ? `Allow access to ${metadata.filepath}`
        : typeof metadata?.filePath === "string"
          ? `Allow access to ${metadata.filePath}`
          : typeof metadata?.path === "string"
            ? `Allow access to ${metadata.path}`
            : typeof metadata?.tool === "string"
              ? `Allow ${metadata.tool} tool action`
              : "permission requested";

  if (!id || !sessionId) {
    return undefined;
  }

  const normalizedPattern = patternRaw || metadataPattern;

  return {
    id,
    sessionId,
    title: inferredTitle || metadataTitle || "permission requested",
    type: inferredType || metadataType || "unknown",
    ...(typeof normalizedPattern === "string" ? { pattern: normalizedPattern } : {}),
    ...(details ? { details } : {}),
    ...(filePathCandidate ? { filePathCandidate } : {}),
  };
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function inferAttachmentKind(filePath: string, mime?: string): OutboundAttachment["kind"] {
  if (mime?.startsWith("image/")) {
    return "image";
  }
  if (mime?.startsWith("audio/")) {
    return "audio";
  }
  if (mime?.startsWith("video/")) {
    return "video";
  }

  const lower = filePath.toLowerCase();
  if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.bmp)$/.test(lower)) {
    return "image";
  }
  if (/(\.mp3|\.wav|\.ogg|\.m4a|\.flac)$/.test(lower)) {
    return "audio";
  }
  if (/(\.mp4|\.mov|\.avi|\.mkv|\.webm)$/.test(lower)) {
    return "video";
  }
  return "document";
}

function normalizePath(candidate: string, cwd: string): string {
  const trimmed = candidate.trim().replace(/[.,;:!?]+$/, "");
  if (trimmed.startsWith("~/")) {
    return resolve(process.env.HOME || cwd, trimmed.slice(2));
  }
  if (isAbsolute(trimmed)) {
    return trimmed;
  }
  return resolve(cwd, trimmed);
}


function eventSessionId(payload: { type: string; properties?: Record<string, unknown> }): string | undefined {
  const properties = payload.properties;
  if (!properties) {
    return undefined;
  }

  const direct = properties["sessionID"];
  if (typeof direct === "string") {
    return direct;
  }

  const part = properties["part"] as { sessionID?: unknown } | undefined;
  if (typeof part?.sessionID === "string") {
    return part.sessionID;
  }

  const info = properties["info"] as { sessionID?: unknown; id?: unknown } | undefined;
  if (typeof info?.sessionID === "string") {
    return info.sessionID;
  }
  if (payload.type.startsWith("session.") && typeof info?.id === "string") {
    return info.id;
  }

  return undefined;
}

function normalizeEvent(value: unknown): OpencodeEvent | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type === "string") {
    return {
      type: candidate.type,
      ...(candidate.properties && typeof candidate.properties === "object"
        ? { properties: candidate.properties as Record<string, unknown> }
        : {}),
    };
  }

  const payload = candidate.payload;
  if (payload && typeof payload === "object") {
    const wrapped = payload as Record<string, unknown>;
    if (typeof wrapped.type === "string") {
      return {
        type: wrapped.type,
        ...(wrapped.properties && typeof wrapped.properties === "object"
          ? { properties: wrapped.properties as Record<string, unknown> }
          : {}),
      };
    }
  }

  return undefined;
}

async function resolveAttachment(pathLike: string, cwd: string, mime?: string): Promise<OutboundAttachment | undefined> {
  const filePath = normalizePath(pathLike, cwd);
  if (!(await fileExists(filePath))) {
    return undefined;
  }
  try {
    const details = await stat(filePath);
    if (!details.isFile()) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return {
    kind: inferAttachmentKind(filePath, mime),
    filePath,
  };
}

function formatToolActivity(part: ToolPart): string {
  const status = part.state.status;
  const title = "title" in part.state && part.state.title ? String(part.state.title).trim() : "";
  if (title) {
    return `${part.tool} (${status}): ${title}`;
  }
  return `${part.tool} (${status})`;
}

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

export function createOpenCodeClient(options: ClientBootstrapOptions): OpenCodeClient {
  let contextPromise: Promise<SdkContext> | undefined;
  const bridgeGuidanceSeededSessions = new Set<string>();

  const ensureContext = async (): Promise<SdkContext> => {
    if (!contextPromise) {
      const startedAt = Date.now();
      contextPromise = createSdkContext(options)
        .then((context) => {
          logger.info({ startupMs: Date.now() - startedAt }, "[bui] OpenCode SDK context ready.");
          return context;
        })
        .catch((error) => {
          contextPromise = undefined;
          throw error;
        });
    } else {
      logger.info("[bui] Reusing existing OpenCode SDK context.");
    }
    return await contextPromise;
  };

  const ensureSession = async (client: OpencodeClient, cwd: string | undefined, sessionId: string | undefined): Promise<string> => {
    if (sessionId) {
      try {
        await client.session.get({
          path: { id: sessionId },
          ...(cwd ? { query: { directory: cwd } } : {}),
          throwOnError: true,
        });
        return sessionId;
      } catch {
        logger.warn({ sessionId }, "[bui] Stored session not found on current server; creating a new session.");
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

  const runPromptStream = async (input: {
    prompt: string;
    sessionId?: string;
    cwd?: string;
    signal?: AbortSignal;
    onActivity?: (line: string) => Promise<void> | void;
    onPermissionRequest?: (permission: {
      id: string;
      sessionId: string;
      title: string;
      type: string;
      pattern?: string;
      details?: string;
    }) => Promise<"once" | "always" | "reject">;
  }): Promise<{ sessionId?: string; text: string; activity?: string[]; attachments?: OutboundAttachment[] }> => {
    const injectBridgeToolsPrompt = shouldInjectBridgeToolPrompt();
    const { client } = await ensureContext();
    const cwd = input.cwd;
    let resolvedCwd = cwd || process.cwd();
    logger.info({ cwd: cwd || "default", hasSession: Boolean(input.sessionId) }, "[bui] Starting OpenCode prompt stream.");
    const sid = await ensureSession(client, cwd, input.sessionId);
    logger.info({ sessionId: sid }, "[bui] OpenCode session resolved.");
    const eventStream = await client.event.subscribe({
      ...(cwd ? { query: { directory: cwd } } : {}),
      throwOnError: true,
    });

    const shouldInjectPromptGuidance = injectBridgeToolsPrompt && !bridgeGuidanceSeededSessions.has(sid);
    const promptText = shouldInjectPromptGuidance
      ? `${buildBridgeToolsPreamble()}\n\nUser request:\n${input.prompt}`
      : input.prompt;

    if (shouldInjectPromptGuidance) {
      bridgeGuidanceSeededSessions.add(sid);
      logger.info({ sessionId: sid }, "[bui] Injected one-time bridge tool guidance for session.");
    }

    await client.session.promptAsync({
      path: { id: sid },
      ...(cwd ? { query: { directory: cwd } } : {}),
      body: {
        parts: [{ type: "text", text: promptText }],
      },
      throwOnError: true,
    });
    logger.info({ sessionId: sid }, "[bui] Prompt submitted to OpenCode.");

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
        logger.error({ sessionId: sid, timeoutMs }, "[bui] OpenCode event stream timed out waiting for events.");
        await client.session.abort({
          path: { id: sid },
          ...(cwd ? { query: { directory: cwd } } : {}),
          throwOnError: true,
        });
        throw new Error(`OpenCode event stream timed out after ${timeoutMs}ms`);
      }

      if (next.done) {
        logger.warn({ sessionId: sid }, "[bui] OpenCode event stream ended before session.idle.");
        break;
      }

      const payload = normalizeEvent(next.value);
      if (!payload) {
        continue;
      }

      logger.info({ sessionId: sid, eventType: payload.type }, "[bui] OpenCode event received.");

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

          if (part.state.status === "completed") {
            // Attachments are bridge-tool explicit only via @bui.attach directives.
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
        logger.info({ sessionId: sid, permission }, "[bui] Parsed OpenCode permission request.");
        const line = `permission: ${permission.title}`;
        activity.push(line);
        if (input.onActivity) {
          await input.onActivity(line);
        }

        if (input.onPermissionRequest) {
          logger.info({ sessionId: sid, permissionId: permission.id }, "[bui] Emitting permission request to runtime bridge layer.");
          const response = await input.onPermissionRequest({
            id: permission.id,
            sessionId: permission.sessionId,
            title: permission.title,
            type: permission.type,
            ...(permission.pattern ? { pattern: permission.pattern } : {}),
            ...(permission.details ? { details: permission.details } : {}),
          });
          logger.info({ sessionId: sid, permissionId: permission.id, response }, "[bui] Submitting permission response.");
          try {
            await client.postSessionIdPermissionsPermissionId({
              path: { id: permission.sessionId, permissionID: permission.id },
              ...(cwd ? { query: { directory: cwd } } : {}),
              body: { response },
              throwOnError: true,
            });
            logger.info({ sessionId: sid, permissionId: permission.id }, "[bui] Permission response accepted by OpenCode.");
          } catch (error) {
            logger.error({ sessionId: sid, permissionId: permission.id, error: errorToString(error), rawError: error }, "[bui] Permission response submission failed.");
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
        logger.info({ sessionId: sid }, "[bui] OpenCode session became idle.");
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
      logger.info({ sessionId: sid, directiveCount: directiveParse.directives.length }, "[bui] Parsed bridge attachment directives.");
    }

    for (const directive of directiveParse.directives) {
      const resolved = await resolveAttachment(directive.pathLike, resolvedCwd);
      if (resolved) {
        const withCaption = directive.caption
          ? { ...resolved, caption: directive.caption }
          : resolved;
        attachments.set(resolved.filePath, withCaption);
        logger.info({ sessionId: sid, filePath: resolved.filePath, source: "bridge-directive" }, "[bui] Collected attachment from bridge directive.");
      } else {
        logger.warn({ sessionId: sid, directivePath: directive.pathLike }, "[bui] Bridge attachment directive path could not be resolved.");
      }
    }

    logger.info({ sessionId: sid, textChars: text.length, activityCount: activity.length, attachmentCount: attachments.size }, "[bui] OpenCode prompt stream completed.");

    return {
      sessionId: sid,
      text,
      ...(activity.length > 0 ? { activity } : {}),
      ...(attachments.size > 0 ? { attachments: [...attachments.values()] } : {}),
    };
  };

  return {
    async warmup() {
      await ensureContext();
    },
    async createSession(input) {
      const { client } = await ensureContext();
      const sid = await ensureSession(client, input?.cwd, undefined);
      logger.info({ sessionId: sid }, "[bui] OpenCode session created.");
      return { sessionId: sid, text: "ready" };
    },
    async runPrompt(input) {
      return await runPromptStream(input);
    },
    async runCommand(input) {
      return await runPromptStream({
        prompt: `/${input.command}${input.args ? ` ${input.args}` : ""}`,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.onActivity ? { onActivity: input.onActivity } : {}),
        ...(input.onPermissionRequest ? { onPermissionRequest: input.onPermissionRequest } : {}),
      });
    },
  };
}
