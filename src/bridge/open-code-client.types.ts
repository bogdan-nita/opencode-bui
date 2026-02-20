import type { OutboundAttachment } from "@bridge/envelope.types";

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
  warmup?: (conversationKey?: string) => Promise<void>;
  createSession(input: { conversationKey: string; cwd?: string } & OpenCodeRunOptions): Promise<OpenCodeResult>;
  runPrompt(input: { conversationKey: string; prompt: string; sessionId?: string; cwd?: string } & OpenCodeRunOptions): Promise<OpenCodeResult>;
  runCommand(input: { conversationKey: string; command: string; args?: string; sessionId?: string; cwd?: string } & OpenCodeRunOptions): Promise<OpenCodeResult>;
  getInstanceInfo?: (conversationKey: string) => Promise<{ pid?: number; lastActiveUnixSeconds: number }>;
}
