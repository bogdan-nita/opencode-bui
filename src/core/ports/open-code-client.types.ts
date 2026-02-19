import type { OutboundAttachment } from "@core/domain/envelope.types.js";

export type OpenCodeResult = {
  sessionId?: string;
  text: string;
  activity?: string[];
  attachments?: OutboundAttachment[];
};

export type OpenCodeRunOptions = {
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
};

export interface OpenCodeClient {
  createSession(input?: { cwd?: string } & OpenCodeRunOptions): Promise<OpenCodeResult>;
  runPrompt(input: { prompt: string; sessionId?: string; cwd?: string } & OpenCodeRunOptions): Promise<OpenCodeResult>;
  runCommand(input: { command: string; args?: string; sessionId?: string; cwd?: string } & OpenCodeRunOptions): Promise<OpenCodeResult>;
}
