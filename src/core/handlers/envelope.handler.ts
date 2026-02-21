import { Effect } from "effect";
import type { BridgeAdapter, InboundEnvelope, OutboundEnvelope, SessionStore, OpenCodeClient, AgentStore, Clock } from "@bridge/types";
import { conversationKey } from "@core/conversation-router";
import { routeInbound } from "@core/command-router";
import { logger } from "@infra/logger";
import type { RuntimeState } from "../state/runtime-state.types";
import { AgentStoreService, ClockService, OpenCodeClientService, SessionStoreService } from "@core/services";
import { silentStartCommands } from "../runtime/commands.consts";
import { parseSlashCommand } from "../middleware/slash-command.middleware";
import { startTypingIndicator, stopTypingIndicator } from "./envelope/typing/typing";
import { createActivityTracker } from "./envelope/activity/activity";
import { sendOutboundMessages } from "./envelope/outbound/outbound";
import { captureAndAnalyzeScreenshot } from "./envelope/screenshot/screenshot";

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

  const activityConfig = {
    flushIntervalMs: activityFlushIntervalMs,
    maxLinesPerFlush: maxActivityLinesPerFlush,
    retainLines: activityRetainLines,
  };

  const activityState = createActivityTracker(activityConfig);
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushing = Promise.resolve();

  const typingEnabled = process.env.BUI_TYPING_INDICATOR !== "0";
  let stopTyping: (() => Promise<void> | void) | undefined;

  const doStartTyping = async () => {
    if (!typingEnabled) return;
    stopTyping = await startTypingIndicator({ bridge, conversation: envelope.conversation });
  };

  const doStopTyping = async () => {
    await stopTypingIndicator(stopTyping);
    stopTyping = undefined;
  };

  await doStartTyping();

  const doFlushActivity = async (): Promise<void> => {
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
      flushing = flushing.then(() => doFlushActivity());
    }
  };

  const doScheduleActivityFlush = () => {
    if (flushTimer) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      flushing = flushing.then(() => doFlushActivity());
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
      doScheduleActivityFlush();
    },
    onPermissionRequest: async (permission) => {
      logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id, type: permission.type }, "[bui] Permission request received from OpenCode.");
      await doStopTyping();
      const permissionTimeoutMsRaw = Number.parseInt(process.env.BUI_PERMISSION_TIMEOUT_MS || "600000", 10);
      const permissionTimeoutMs = Number.isFinite(permissionTimeoutMsRaw) && permissionTimeoutMsRaw > 0 ? permissionTimeoutMsRaw : 600000;

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
          resolve: (response: "once" | "always" | "reject") => {
            clearTimeout(timer);
            state.pendingPermissions.delete(permission.id);
            logger.info(
              { bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id, response },
              "[bui] Resolving pending permission response.",
            );
            void doStartTyping();
            resolvePermission(response);
          },
          timer,
        });

        state.lastPermissionByConversation.set(key, permission.id);

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
    await doFlushActivity();
  } catch (error) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    await flushing;
    await doFlushActivity();
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
    await doStopTyping();
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

    await sendOutboundMessages(
      { bridge, conversation: envelope.conversation },
      [message],
      { maxAttachmentsPerMessage, maxAttachmentBytes },
    );

    await captureAndAnalyzeScreenshot(message, {
      bridge,
      conversation: envelope.conversation,
      sessionStore,
      openCodeClient,
      uploadDir: config.uploadDir,
    });
  }
}
