import { logger } from "@runtime/logger";
import { fileExists } from "@runtime/runtime-fs";
import type { OutboundAttachment } from "@runtime/bridge/types";
import { isAbsolute, resolve } from "node:path";
import { opencodeEventSchema } from "./agent.schema";
import { z } from "zod";

export type RunOpencodeInput = {
  prompt?: string;
  command?: string;
  commandArgs?: string;
  sessionId?: string;
  workdir?: string;
  opencodeBin: string;
  attachUrl?: string;
  signal?: AbortSignal;
  onActivity?: (line: string) => Promise<void> | void;
};

async function collectLinesFromBunStream(stream: ReadableStream<Uint8Array>, onLine: (line: string) => Promise<void>): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    pending += decoder.decode(chunk.value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      await onLine(line);
    }
  }
  pending += decoder.decode();
  if (pending.trim()) {
    await onLine(pending);
  }
}

async function executeOpencode(input: { argv: string[]; cwd: string; signal?: AbortSignal; onStdoutLine: (line: string) => Promise<void> }): Promise<{ code: number; stderr: string }> {
  if (typeof Bun !== "undefined") {
    const proc = Bun.spawn(input.argv, {
      cwd: input.cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      ...(input.signal ? { signal: input.signal } : {}),
    });

    const stderrPromise = new Response(proc.stderr).text();
    const stdoutPromise = collectLinesFromBunStream(proc.stdout, input.onStdoutLine);
    const code = await proc.exited.catch(() => (input.signal?.aborted ? 130 : 1));
    await stdoutPromise;
    const stderr = await stderrPromise;
    return { code, stderr };
  }

  const { spawn } = await import("node:child_process");
  return await new Promise<{ code: number; stderr: string }>((resolveResult, rejectResult) => {
    const command = input.argv[0];
    if (!command) {
      rejectResult(new Error("No command provided"));
      return;
    }

    const child = spawn(command, input.argv.slice(1), {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      ...(input.signal ? { signal: input.signal } : {}),
    });

    let stderr = "";
    let pending = "";

    child.stdout.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        void input.onStdoutLine(line);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", rejectResult);
    child.on("close", (code) => {
      if (pending.trim()) {
        void input.onStdoutLine(pending);
      }
      resolveResult({ code: code ?? 0, stderr });
    });
  });
}

function inferAttachmentKind(filePath: string): OutboundAttachment["kind"] {
  const value = filePath.toLowerCase();
  if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.bmp)$/.test(value)) {
    return "image";
  }
  if (/(\.mp3|\.wav|\.ogg|\.m4a|\.flac)$/.test(value)) {
    return "audio";
  }
  if (/(\.mp4|\.mov|\.avi|\.mkv|\.webm)$/.test(value)) {
    return "video";
  }
  return "document";
}

function collectCandidatePaths(text: string): string[] {
  const matches = new Set<string>();
  const markdownLinkPattern = /!?\[[^\]]*\]\((\/[^)\s]+)\)/g;
  const absolutePathPattern = /(^|\s)(\/[^\s"'`<>]+(?:\.[A-Za-z0-9]{1,10})?)/g;
  const relativePathPattern = /(^|\s)(~\/[^\s"'`<>]+|\.?\.\/[^\s"'`<>]+|[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]{1,10})/g;

  for (const match of text.matchAll(markdownLinkPattern)) {
    const value = match[1];
    if (value) {
      matches.add(value.trim());
    }
  }
  for (const match of text.matchAll(absolutePathPattern)) {
    const value = match[2];
    if (value) {
      matches.add(value.trim());
    }
  }
  for (const match of text.matchAll(relativePathPattern)) {
    const value = match[2];
    if (value) {
      matches.add(value.trim());
    }
  }

  return [...matches].slice(0, 8);
}

function normalizeCandidatePath(candidate: string, cwd: string): string {
  const cleaned = candidate.replace(/[.,;:!?]+$/, "").replace(/^`|`$/g, "").trim();
  if (cleaned.startsWith("~/")) {
    const home = process.env.HOME ?? cwd;
    return resolve(home, cleaned.slice(2));
  }
  if (isAbsolute(cleaned)) {
    return cleaned;
  }
  return resolve(cwd, cleaned);
}

async function collectAttachments(text: string, cwd: string): Promise<OutboundAttachment[]> {
  const candidates = collectCandidatePaths(text);
  const attachments: OutboundAttachment[] = [];

  for (const candidate of candidates) {
    const resolvedPath = normalizeCandidatePath(candidate, cwd);
    if (!(await fileExists(resolvedPath))) {
      continue;
    }
    attachments.push({
      kind: inferAttachmentKind(resolvedPath),
      filePath: resolvedPath,
    });
  }

  return attachments;
}

function formatActivityEvent(record: z.infer<typeof opencodeEventSchema>): string | undefined {
  const type = record.type;
  if (!type) {
    return undefined;
  }
  if (type === "step_start") {
    return "step started";
  }
  if (type === "step_finish") {
    const reason = record.part?.reason || "unknown";
    const totalTokens = record.part?.tokens?.total;
    return totalTokens ? `step finished (${reason}, tokens=${totalTokens})` : `step finished (${reason})`;
  }
  if (type === "text") {
    return undefined;
  }
  if (type === "tool_use") {
    const tool = record.part?.tool || "tool";
    const status = record.part?.state?.status || "unknown";
    const title = record.part?.state?.title?.trim();
    return title ? `${tool} (${status}): ${title}` : `${tool} (${status})`;
  }
  const detail = record.part?.type;
  return detail ? `${type} (${detail})` : type;
}

async function collectAttachmentsFromToolEvent(record: z.infer<typeof opencodeEventSchema>, cwd: string): Promise<OutboundAttachment[]> {
  const files = record.part?.state?.metadata?.files || [];
  const attachments: OutboundAttachment[] = [];

  for (const file of files) {
    const filePath = file.filePath || file.relativePath;
    if (!filePath) {
      continue;
    }
    const resolvedPath = normalizeCandidatePath(filePath, cwd);
    if (!(await fileExists(resolvedPath))) {
      continue;
    }
    attachments.push({
      kind: inferAttachmentKind(resolvedPath),
      filePath: resolvedPath,
    });
  }

  return attachments;
}

export async function runOpencode(input: RunOpencodeInput): Promise<{ sessionId?: string; text: string; activity?: string[]; attachments?: OutboundAttachment[] }> {
  const args: string[] = ["run", "--format", "json"];
  if (input.command) {
    args.push("--command", input.command);
    if (input.commandArgs?.length) {
      args.push(input.commandArgs);
    }
  } else {
    args.push(input.prompt ?? "");
  }
  if (input.sessionId) {
    args.push("--session", input.sessionId);
  }
  if (input.attachUrl) {
    args.push("--attach", input.attachUrl);
  }

  const cwd = input.workdir || process.cwd();
  logger.debug(
    {
      hasPrompt: Boolean(input.prompt),
      command: input.command,
      hasArgs: Boolean(input.commandArgs),
      hasSessionId: Boolean(input.sessionId),
      workdir: cwd,
    },
    "[bui] Executing OpenCode process.",
  );

  const parts: string[] = [];
  const activity: string[] = [];
  const attachmentMap = new Map<string, OutboundAttachment>();
  let sessionId: string | undefined;

  const processLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      const raw = `raw: ${trimmed}`;
      activity.push(raw);
      if (input.onActivity) {
        await input.onActivity(raw);
      }
      return;
    }

    const parsed = opencodeEventSchema.safeParse(event);
    if (!parsed.success) {
      return;
    }
    const record = parsed.data;

    if (record.sessionID) {
      sessionId = record.sessionID;
    }
    if (record.type === "text" && record.part?.type === "text" && record.part?.text) {
      parts.push(record.part.text);
      return;
    }

    if (record.type === "tool_use") {
      const metadataAttachments = await collectAttachmentsFromToolEvent(record, cwd);
      for (const attachment of metadataAttachments) {
        attachmentMap.set(attachment.filePath, attachment);
      }

      const outputText = record.part?.state?.output;
      if (outputText?.trim()) {
        const outputAttachments = await collectAttachments(outputText, cwd);
        for (const attachment of outputAttachments) {
          attachmentMap.set(attachment.filePath, attachment);
        }
      }
    }

    const activityLine = formatActivityEvent(record);
    if (activityLine) {
      activity.push(activityLine);
      if (input.onActivity) {
        await input.onActivity(activityLine);
      }
    }
  };

  const { stderr, code } = await executeOpencode({
    argv: [input.opencodeBin, ...args],
    cwd,
    ...(input.signal ? { signal: input.signal } : {}),
    onStdoutLine: processLine,
  });

  if (input.signal?.aborted) {
    throw new Error("OpenCode run interrupted.");
  }

  if (code !== 0) {
    logger.error({ code, stderr: stderr.trim() }, "[bui] OpenCode process failed.");
    throw new Error(stderr.trim() || `opencode exit ${code}`);
  }

  const text = parts.join("");
  if (text) {
    const textAttachments = await collectAttachments(text, cwd);
    for (const attachment of textAttachments) {
      attachmentMap.set(attachment.filePath, attachment);
    }
  }
  const attachments = [...attachmentMap.values()];
  if (attachments.length > 0) {
    logger.info({ count: attachments.length }, "[bui] OpenCode response referenced local attachments.");
  }

  return {
    ...(sessionId ? { sessionId } : {}),
    text,
    ...(activity.length > 0 ? { activity } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}
