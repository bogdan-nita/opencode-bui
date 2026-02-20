import { Effect } from "effect";
import { stat } from "node:fs/promises";
import type { BridgeAdapter, InboundEnvelope, OutboundEnvelope, SessionStore, OpenCodeClient, AgentStore, Clock } from "@runtime/bridge/types";
import { captureScreenshot } from "@runtime/bridge/media-coordinator";
import { conversationKey } from "@runtime/conversation-router";
import { routeInbound } from "@runtime/command-router";
import { logger } from "@runtime/logger";
import type { RuntimeState } from "../state/runtime-state.types";
import { AgentStoreService, ClockService, OpenCodeClientService, SessionStoreService } from "@runtime/services";
import { silentStartCommands } from "../commands.consts";
import { parseSlashCommand } from "../middleware/slash-command.middleware";

export type ProcessEnvelopeDeps = {
  bridge: BridgeAdapter;
  envelope: InboundEnvelope;
  state: RuntimeState;
  sessionStore: SessionStore;
  openCodeClient: OpenCodeClient;
  agentStore: AgentStore;
  clock: Clock;
  config: {
    uploadDir: string;
  };
};

export type ActivityState = {
  queue: string[];
  lines: string[];
  messageToken: string | undefined;
};

function parseEnvInt(value: string | undefined, defaultValue: number): number {
  const raw = Number.parseInt(value || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultValue;
}

function renderActivityText(activityLines: string[], retainLines: number): string {
  const recent = activityLines.slice(-retainLines);
  const body = recent.map((line) => `> ${line}`);
  const lines = body.length > 0 ? body : ["> run started"];
  let text = lines.join("\n");
  while (text.length > 3500 && lines.length > 2) {
    lines.splice(0, 1);
    text = lines.join("\n");
  }
  return text;
}

export async function processEnvelope(deps: ProcessEnvelopeDeps): Promise<void> {
  const { bridge, envelope, state, sessionStore, openCodeClient, agentStore, clock, config } = deps;
  const key = conversationKey(envelope.conversation);
  const controller = new AbortController();
  state.activeRuns.set(key, controller);
  logger.info({ bridgeId: envelope.bridgeId, conversation: key, eventType: envelope.event.type }, "[bui] Processing inbound envelope.");

  const activityFlushIntervalMs = parseEnvInt(process.env.BUI_ACTIVITY_FLUSH_INTERVAL_MS, 1200);
  const maxActivityLinesPerFlush = parseEnvInt(process.env.BUI_ACTIVITY_LINES_PER_MESSAGE, 8);
  const activityRetainLines = parseEnvInt(process.env.BUI_ACTIVITY_RETAIN_LINES, 24);
  const activityState: ActivityState = {
    queue: [],
    lines: [],
    messageToken: undefined,
  };
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushing = Promise.resolve();
  let stopTyping: (() => Promise<void> | void) | undefined;

  const typingEnabled = process.env.BUI_TYPING_INDICATOR !== "0";
  const startTypingIndicator = async () => {
    if (!typingEnabled || !bridge.beginTyping || stopTyping) {
      return;
    }
    try {
      stopTyping = await bridge.beginTyping(envelope.conversation);
      logger.info({ bridgeId: envelope.bridgeId, conversation: key }, "[bui] Typing indicator started.");
    } catch (error) {
      logger.warn({ error, bridgeId: envelope.bridgeId, conversation: key }, "[bui] Failed to start typing indicator.");
    }
  };

  const stopTypingIndicator = async () => {
    if (!stopTyping) {
      return;
    }
    try {
      await stopTyping();
      logger.info({ bridgeId: envelope.bridgeId, conversation: key }, "[bui] Typing indicator stopped.");
    } catch (error) {
      logger.warn({ error, bridgeId: envelope.bridgeId, conversation: key }, "[bui] Failed to stop typing indicator.");
    } finally {
      stopTyping = undefined;
    }
  };

  await startTypingIndicator();

  const flushActivity = async (): Promise<void> => {
    if (activityState.queue.length === 0) {
      return;
    }
    const lines = activityState.queue.splice(0, maxActivityLinesPerFlush);
    activityState.lines.push(...lines);
    if (bridge.upsertActivityMessage) {
      activityState.messageToken = await bridge.upsertActivityMessage({
        conversation: envelope.conversation,
        text: renderActivityText(activityState.lines, activityRetainLines),
        ...(activityState.messageToken ? { token: activityState.messageToken } : {}),
      });
    } else {
      await bridge.send({
        bridgeId: envelope.bridgeId,
        conversation: envelope.conversation,
        text: renderActivityText(activityState.lines, activityRetainLines),
      });
    }
    if (activityState.queue.length > 0) {
      flushing = flushing.then(() => flushActivity());
    }
  };

  const scheduleActivityFlush = () => {
    if (flushTimer) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      flushing = flushing.then(() => flushActivity());
    }, activityFlushIntervalMs);
  };

  const slash = parseSlashCommand(envelope);
  const shouldAnnounceStart = !slash || !silentStartCommands.has(slash.command);
  if (shouldAnnounceStart) {
    activityState.lines.push("run started");
    if (bridge.upsertActivityMessage) {
      activityState.messageToken = await bridge.upsertActivityMessage({
        conversation: envelope.conversation,
        text: renderActivityText(activityState.lines, activityRetainLines),
      });
    } else {
      await bridge.send({
        bridgeId: envelope.bridgeId,
        conversation: envelope.conversation,
        text: renderActivityText(activityState.lines, activityRetainLines),
      });
    }
  }

  const program = routeInbound(envelope, {
    signal: controller.signal,
    onActivity: async (line) => {
      logger.info({ bridgeId: envelope.bridgeId, conversation: key, activity: line }, "[bui] OpenCode activity event.");
      activityState.queue.push(line);
      scheduleActivityFlush();
    },
    onPermissionRequest: async (permission) => {
      logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id, type: permission.type }, "[bui] Permission request received from OpenCode.");
      await stopTypingIndicator();
      const permissionTimeoutMsRaw = Number.parseInt(process.env.BUI_PERMISSION_TIMEOUT_MS || "600000", 10);
      const permissionTimeoutMs = Number.isFinite(permissionTimeoutMsRaw) && permissionTimeoutMsRaw > 0 ? permissionTimeoutMsRaw : 600000;

      // Note: permissionStore and pendingPermissions are handled in the main runtime
      // This is a callback that will be awaited
      return await new Promise<"once" | "always" | "reject">((resolvePermission) => {
        const previous = state.pendingPermissions.get(permission.id);
        if (previous) {
          clearTimeout(previous.timer);
          previous.resolve("reject");
          logger.warn(
            { bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id },
            "[bui] Replaced existing pending permission entry.",
          );
        }

        const timer = setTimeout(() => {
          state.pendingPermissions.delete(permission.id);
          logger.warn({ bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id }, "[bui] Permission request timed out; rejecting.");
          void bridge.send({
            bridgeId: envelope.bridgeId,
            conversation: envelope.conversation,
            text: `Permission request expired: ${permission.id}`,
          });
          resolvePermission("reject");
        }, permissionTimeoutMs);

        state.pendingPermissions.set(permission.id, {
          conversationKey: key,
          requesterUserId: envelope.user.id,
          resolve: (response) => {
            clearTimeout(timer);
            state.pendingPermissions.delete(permission.id);
            logger.info(
              { bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id, response },
              "[bui] Resolving pending permission response.",
            );
            void startTypingIndicator();
            resolvePermission(response);
          },
          timer,
        });

        state.lastPermissionByConversation.set(key, permission.id);

        // Send permission request to user
        const permissionLines = [
          "Permission required",
          `- Request ID: ${permission.id}`,
          `- Title: ${permission.title}`,
          `- Type: ${permission.type}`,
          `- Requester: ${envelope.user.id}`,
          ...(permission.pattern ? [`- Pattern: ${permission.pattern}`] : []),
          ...(permission.details ? [`- Details: ${permission.details}`] : []),
          `- Expires in: ${Math.ceil(permissionTimeoutMs / 1000)}s`,
          `- Fallback: /permit once ${permission.id}`,
        ];
        void bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: permissionLines.join("\n"),
          buttons: [
            [
              { id: "permission-response", label: "Allow Once", value: `once:${permission.id}` },
              { id: "permission-response", label: "Always Allow", value: `always:${permission.id}` },
            ],
            [{ id: "permission-response", label: "Reject", value: `reject:${permission.id}` }],
          ],
        });

        logger.info(
          {
            bridgeId: envelope.bridgeId,
            conversation: key,
            permissionId: permission.id,
            pendingPermissionIds: [...state.pendingPermissions.keys()],
          },
          "[bui] Waiting for permission button response.",
        );
      });
    },
  });

  const withServices = Effect.provideService(
    Effect.provideService(
      Effect.provideService(Effect.provideService(program, SessionStoreService, sessionStore), AgentStoreService, agentStore),
      OpenCodeClientService,
      openCodeClient,
    ),
    ClockService,
    clock,
  );

  let outbound: OutboundEnvelope[];
  try {
    outbound = await Effect.runPromise(withServices);
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    await flushing;
    await flushActivity();
  } catch (error) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    await flushing;
    await flushActivity();
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();

    if (controller.signal.aborted) {
      logger.info({ bridgeId: envelope.bridgeId }, "[bui] OpenCode run interrupted by user.");
      activityState.lines.push("run interrupted");
      if (bridge.upsertActivityMessage) {
        await bridge.upsertActivityMessage({
          conversation: envelope.conversation,
          text: renderActivityText(activityState.lines, activityRetainLines),
          ...(activityState.messageToken ? { token: activityState.messageToken } : {}),
        });
      }
      await bridge.send({
        bridgeId: envelope.bridgeId,
        conversation: envelope.conversation,
        text: "OpenCode run interrupted.",
      });
      return;
    }
    logger.error({ error: message, rawError: error, bridgeId: envelope.bridgeId }, "[bui] Failed to process envelope.");
    activityState.lines.push(`run failed (${message})`);
    if (bridge.upsertActivityMessage) {
      await bridge.upsertActivityMessage({
        conversation: envelope.conversation,
        text: renderActivityText(activityState.lines, activityRetainLines),
        ...(activityState.messageToken ? { token: activityState.messageToken } : {}),
      });
    }
    await bridge.send({
      bridgeId: envelope.bridgeId,
      conversation: envelope.conversation,
      text: `Run failed: ${message}`,
    });
    return;
  } finally {
    await stopTypingIndicator();
    const active = state.activeRuns.get(key);
    if (active === controller) {
      state.activeRuns.delete(key);
    }
  }

  activityState.lines.push("run completed");
  if (bridge.upsertActivityMessage) {
    activityState.messageToken = await bridge.upsertActivityMessage({
      conversation: envelope.conversation,
      text: renderActivityText(activityState.lines, activityRetainLines),
      ...(activityState.messageToken ? { token: activityState.messageToken } : {}),
    });
  }

  logger.info({ bridgeId: envelope.bridgeId, conversation: key, outboundCount: outbound.length }, "[bui] Outbound responses generated.");
  const maxAttachmentsPerMessage = parseEnvInt(process.env.BUI_MAX_ATTACHMENTS_PER_MESSAGE, 6);
  const maxAttachmentBytes = parseEnvInt(process.env.BUI_MAX_ATTACHMENT_BYTES, 10485760);

  for (const message of outbound) {
    logger.info(
      {
        bridgeId: envelope.bridgeId,
        conversation: key,
        hasText: Boolean(message.text),
        textChars: message.text?.length ?? 0,
        attachmentCount: message.attachments?.length ?? 0,
        buttonRows: message.buttons?.length ?? 0,
      },
      "[bui] Sending outbound message to bridge.",
    );

    let sanitizedMessage = message;
    if (message.attachments && message.attachments.length > 0) {
      const kept = [] as NonNullable<typeof message.attachments>;
      const skipped: string[] = [];
      for (const attachment of message.attachments.slice(0, maxAttachmentsPerMessage)) {
        let size = -1;
        try {
          const details = await stat(attachment.filePath);
          size = details.size;
        } catch {
          skipped.push(`${attachment.filePath} (missing)`);
          continue;
        }
        if (size > maxAttachmentBytes) {
          skipped.push(`${attachment.filePath} (too large)`);
          continue;
        }
        kept.push(attachment);
      }
      if (message.attachments.length > maxAttachmentsPerMessage) {
        skipped.push(`${message.attachments.length - maxAttachmentsPerMessage} attachment(s) omitted by limit`);
      }
      sanitizedMessage = kept.length > 0 ? { ...message, attachments: kept } : (() => {
        const withoutAttachments = { ...message };
        delete withoutAttachments.attachments;
        return withoutAttachments;
      })();
      if (skipped.length > 0) {
        await bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: ["Some attachments were skipped:", ...skipped.map((line) => `- ${line}`)].join("\n"),
        });
      }
    }

    try {
      await bridge.send(sanitizedMessage);
      logger.info({ bridgeId: envelope.bridgeId, conversation: key }, "[bui] Outbound message sent.");
    } catch (error) {
      logger.error({ error, bridgeId: bridge.id }, "[bui] Failed to send outbound message.");
      continue;
    }
    if (message.meta?.["action"] === "capture-screenshot") {
      const note = message.meta?.["note"];
      try {
        const path = await captureScreenshot(config.uploadDir, {
          conversationId: key,
          ...(note ? { note } : {}),
        });
        logger.info({ path, bridgeId: envelope.bridgeId }, "[bui] Screenshot captured.");

        await bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          attachments: [
            {
              kind: "image",
              filePath: path,
              caption: "Captured screenshot",
            },
          ],
          text: "Screenshot captured and sent. Analyzing...",
        });

        const mapping = await sessionStore.getSessionByConversation(envelope.conversation);
        const result = await openCodeClient.runPrompt({
          conversationKey: key,
          prompt: `User shared a local screenshot at ${path}${note ? `\nNote: ${note}` : ""}. Analyze and help.`,
          ...(mapping?.sessionId ? { sessionId: mapping.sessionId } : {}),
          ...(mapping?.cwd ? { cwd: mapping.cwd } : {}),
        });
        if (result.sessionId && result.sessionId !== mapping?.sessionId) {
          await sessionStore.setSessionForConversation(envelope.conversation, result.sessionId, mapping?.cwd);
        }
        await bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: result.text || "No text returned.",
        });
      } catch (error) {
        logger.error({ error, bridgeId: envelope.bridgeId }, "[bui] Screenshot pipeline failed.");
        await bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: "Screenshot capture/send failed. Check runtime logs for details.",
        });
      }
    }
  }
}
