import { isAbsolute, resolve } from "node:path";
import { stat } from "node:fs/promises";
import { fileExists } from "@runtime/runtime-fs";
import type { OutboundAttachment } from "@bridge/envelope.types";
import type { ToolPart } from "@opencode-ai/sdk";
import type {
  OpencodeEvent,
  BridgeAttachmentDirective,
  ExtractedPermission,
} from "./client.types";

/** Check if bridge tool prompts should be injected */
export function shouldInjectBridgeToolPrompt(): boolean {
  return process.env.BUI_AGENT_BRIDGE_TOOLS === "1";
}

/** Strip leading and trailing quotes from a string */
export function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Parse bridge attachment directives from text */
export function parseBridgeAttachmentDirectives(text: string): { cleanText: string; directives: BridgeAttachmentDirective[] } {
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

/** Build the bridge tools preamble for prompt injection */
export function buildBridgeToolsPreamble(): string {
  return [
    "Bridge tool rules (OpenCode BUI):",
    "- To send a file/image/audio/video to the user, emit one line exactly in this format:",
    "  @bui.attach <path> | <optional caption>",
    "- Use absolute paths or paths relative to current working directory.",
    "- Emit attach directives only when the user explicitly asked to receive files/media.",
    "- You may emit multiple @bui.attach lines.",
  ].join("\n");
}

/** Convert an unknown error to a string */
export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Infer the attachment kind from file path or mime type */
export function inferAttachmentKind(filePath: string, mime?: string): OutboundAttachment["kind"] {
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

/** Normalize a path candidate to an absolute path */
export function normalizePath(candidate: string, cwd: string): string {
  const trimmed = candidate.trim().replace(/[.,;:!?]+$/, "");
  if (trimmed.startsWith("~/")) {
    return resolve(process.env.HOME || cwd, trimmed.slice(2));
  }
  if (isAbsolute(trimmed)) {
    return trimmed;
  }
  return resolve(cwd, trimmed);
}

/** Resolve a path-like string to an OutboundAttachment */
export async function resolveAttachment(pathLike: string, cwd: string, mime?: string): Promise<OutboundAttachment | undefined> {
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

/** Format tool activity for display */
export function formatToolActivity(part: ToolPart): string {
  const status = part.state.status;
  const title = "title" in part.state && part.state.title ? String(part.state.title).trim() : "";
  if (title) {
    return `${part.tool} (${status}): ${title}`;
  }
  return `${part.tool} (${status})`;
}

/** Extract session ID from an event payload */
export function eventSessionId(payload: { type: string; properties?: Record<string, unknown> }): string | undefined {
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

/** Normalize an unknown value to an OpencodeEvent */
export function normalizeEvent(value: unknown): OpencodeEvent | undefined {
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

/** Extract permission request from an event payload */
export function extractPermissionRequest(payload: OpencodeEvent): ExtractedPermission | undefined {
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
