import { Effect } from "effect";
import { stat } from "node:fs/promises";
import { createOpenCodeClient } from "@infra/opencode/open-code-client.utils.js";
import { discoverOpencodeCommands, mergeBridgeCommands } from "@infra/opencode/opencode-commands.utils.js";
import { createSystemClock } from "@infra/time/system-clock.utils.js";
import { logger } from "@infra/runtime/logger.utils.js";
import { createBuiDb } from "@infra/db/db.utils.js";
import { createLibsqlSessionStore } from "@infra/store/libsql-session-store.utils.js";
import { createLibsqlAgentStore } from "@infra/store/libsql-agent-store.utils.js";
import { createFileMediaStore } from "@infra/store/file-media-store.utils.js";
import { captureScreenshot } from "./media-coordinator.utils.js";
import { conversationKey } from "./conversation-router.utils.js";
import { chooseBacklogMessages, isBacklogMessage } from "./backlog-coordinator.utils.js";
import { routeInbound } from "./command-router.utils.js";
import { splitCommand } from "@core/domain/bridge.utils.js";
import type { BuiRuntimeDependencies } from "./bui-runtime.types.js";
import { AgentStoreService, ClockService, OpenCodeClientService, SessionStoreService } from "./services.types.js";
import type { InboundEnvelope } from "../domain/envelope.types.js";
import { startAllBridges, stopAllBridges, waitForShutdownSignal } from "./bridge-supervisor.utils.js";
import { bridgeDefinitionById } from "./bridge-registry.utils.js";

const nativeCommands = [
  { command: "start", description: "Show bot help" },
  { command: "new", description: "Start a new OpenCode session" },
  { command: "cd", description: "Change workspace" },
  { command: "cwd", description: "Show workspace" },
  { command: "session", description: "Show mapped session" },
  { command: "context", description: "Show run and attach context" },
  { command: "interrupt", description: "Interrupt active OpenCode run" },
  { command: "screenshot", description: "Capture and analyze screenshot" },
  { command: "reload", description: "Reload config" },
  { command: "health", description: "Show bridge health" },
  { command: "pid", description: "Show process id" },
  { command: "agent", description: "Agent utility commands" },
  { command: "help", description: "Run OpenCode /help" },
  { command: "init", description: "Run OpenCode /init" },
  { command: "undo", description: "Run OpenCode /undo" },
  { command: "redo", description: "Run OpenCode /redo" },
];

export async function startBuiRuntime(input: BuiRuntimeDependencies): Promise<void> {
  logger.info(`[bui] Starting runtime with ${input.bridges.length} bridge(s).`);
  logger.info(`[bui] Using database: ${input.config.paths.dbPath}`);
  const database = await createBuiDb(input.config.paths.dbPath);

  const sessionStore = createLibsqlSessionStore(database);
  const agentStore = createLibsqlAgentStore(database);
  const mediaStore = createFileMediaStore(input.config.paths.uploadDir);
  const openCodeClient = createOpenCodeClient({
    opencodeBin: input.config.opencodeBin,
    ...(input.config.opencodeAttachUrl ? { attachUrl: input.config.opencodeAttachUrl } : {}),
  });
  const clock = createSystemClock();
  const pendingBacklog = new Map<string, InboundEnvelope[]>();
  const backlogTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const unresolvedBacklog = new Map<string, InboundEnvelope[]>();
  const activeRuns = new Map<string, AbortController>();
  const sessionIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const conversationRefs = new Map<string, InboundEnvelope["conversation"]>();
  const sessionIdleTimeoutSeconds = input.config.sessionIdleTimeoutSeconds;
  const sessionIdleTimeoutMs = sessionIdleTimeoutSeconds * 1000;
  const permissionButtonKeys = new Map<string, string>();
  const permissionTimeoutMsRaw = Number.parseInt(process.env.BUI_PERMISSION_TIMEOUT_MS || "600000", 10);
  const permissionTimeoutMs = Number.isFinite(permissionTimeoutMsRaw) && permissionTimeoutMsRaw > 0 ? permissionTimeoutMsRaw : 600000;
  const pendingPermissions = new Map<string, {
    conversationKey: string;
    requesterUserId: string;
    buttonKey: string;
    resolve: (response: "once" | "always" | "reject") => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  const settledPermissionButtonKeys = new Map<string, "submitted" | "expired">();
  const settledPermissionButtonTtlMsRaw = Number.parseInt(process.env.BUI_PERMISSION_SETTLED_TTL_MS || "900000", 10);
  const settledPermissionButtonTtlMs = Number.isFinite(settledPermissionButtonTtlMsRaw) && settledPermissionButtonTtlMsRaw > 0
    ? settledPermissionButtonTtlMsRaw
    : 900000;

  const markPermissionButtonKeySettled = (buttonKey: string, state: "submitted" | "expired") => {
    settledPermissionButtonKeys.set(buttonKey, state);
    setTimeout(() => {
      const current = settledPermissionButtonKeys.get(buttonKey);
      if (current === state) {
        settledPermissionButtonKeys.delete(buttonKey);
      }
    }, settledPermissionButtonTtlMs);
  };

  const isInterruptEvent = (envelope: InboundEnvelope): boolean => {
    if (envelope.event.type === "slash") {
      return envelope.event.command === "interrupt" || envelope.event.command === "interupt";
    }
    if (envelope.event.type === "text" && envelope.event.text.trim().startsWith("/")) {
      const command = splitCommand(envelope.event.text).command;
      return command === "interrupt" || command === "interupt";
    }
    return false;
  };

  const parsePermissionResponseFromText = (
    envelope: InboundEnvelope,
  ): { permissionId: string; response: "once" | "always" | "reject" } | undefined => {
    if (envelope.event.type !== "text") {
      return undefined;
    }
    const slash = splitCommand(envelope.event.text);
    if (slash.command !== "permit" && slash.command !== "permission") {
      return undefined;
    }
    const [responseRaw, permissionIdRaw] = slash.args.split(/\s+/, 2);
    const response = responseRaw === "once" || responseRaw === "always" || responseRaw === "reject" ? responseRaw : undefined;
    const permissionId = permissionIdRaw?.trim();
    if (!response || !permissionId) {
      return undefined;
    }
    return { permissionId, response };
  };

  const parseSlashCommand = (envelope: InboundEnvelope): { command: string; args: string } | undefined => {
    if (envelope.event.type === "slash") {
      return { command: envelope.event.command, args: envelope.event.args };
    }
    if (envelope.event.type === "text" && envelope.event.text.trim().startsWith("/")) {
      return splitCommand(envelope.event.text);
    }
    return undefined;
  };

  const clearSessionIdleTimer = (key: string) => {
    const timer = sessionIdleTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      sessionIdleTimers.delete(key);
    }
  };

  const scheduleSessionIdleExpiry = (key: string) => {
    if (sessionIdleTimeoutMs <= 0) {
      return;
    }
    clearSessionIdleTimer(key);
    const conversation = conversationRefs.get(key);
    if (!conversation) {
      return;
    }
    const timer = setTimeout(() => {
      sessionIdleTimers.delete(key);
      void (async () => {
        try {
          await sessionStore.clearSessionForConversation(conversation);
          logger.info({ conversation: key, idleSeconds: sessionIdleTimeoutSeconds }, "[bui] Cleared idle conversation session mapping.");
        } catch (error) {
          logger.warn({ conversation: key, error }, "[bui] Failed to clear idle conversation session mapping.");
        }
      })();
    }, sessionIdleTimeoutMs);
    sessionIdleTimers.set(key, timer);
  };

  const processEnvelope = async (bridge: (typeof input.bridges)[number], envelope: InboundEnvelope): Promise<void> => {
    const key = conversationKey(envelope.conversation);
    const controller = new AbortController();
    activeRuns.set(key, controller);
    logger.info({ bridgeId: envelope.bridgeId, conversation: key, eventType: envelope.event.type }, "[bui] Processing inbound envelope.");

    const activityFlushIntervalMsRaw = Number.parseInt(process.env.BUI_ACTIVITY_FLUSH_INTERVAL_MS || "1200", 10);
    const activityFlushIntervalMs = Number.isFinite(activityFlushIntervalMsRaw) && activityFlushIntervalMsRaw > 0
      ? activityFlushIntervalMsRaw
      : 1200;
    const maxActivityLinesPerFlushRaw = Number.parseInt(process.env.BUI_ACTIVITY_LINES_PER_MESSAGE || "8", 10);
    const maxActivityLinesPerFlush = Number.isFinite(maxActivityLinesPerFlushRaw) && maxActivityLinesPerFlushRaw > 0
      ? maxActivityLinesPerFlushRaw
      : 8;
    const activityRetainLinesRaw = Number.parseInt(process.env.BUI_ACTIVITY_RETAIN_LINES || "24", 10);
    const activityRetainLines = Number.isFinite(activityRetainLinesRaw) && activityRetainLinesRaw > 0 ? activityRetainLinesRaw : 24;
    const activityQueue: string[] = [];
    const activityLines: string[] = [];
    let activityMessageToken: string | undefined;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let flushing = Promise.resolve();

    const renderActivityText = (status?: string): string => {
      const recent = activityLines.slice(-activityRetainLines);
      const body = recent.map((line) => `> ${line}`);
      const lines = [status ? `OpenCode ${status}` : "OpenCode activity", ...body];
      let text = lines.join("\n");
      while (text.length > 3500 && lines.length > 2) {
        lines.splice(1, 1);
        text = lines.join("\n");
      }
      return text;
    };

    const flushActivity = async (): Promise<void> => {
      if (activityQueue.length === 0) {
        return;
      }
      const lines = activityQueue.splice(0, maxActivityLinesPerFlush);
      activityLines.push(...lines);
      if (bridge.upsertActivityMessage) {
        activityMessageToken = await bridge.upsertActivityMessage({
          conversation: envelope.conversation,
          text: renderActivityText("activity"),
          ...(activityMessageToken ? { token: activityMessageToken } : {}),
        });
      } else {
        await bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: renderActivityText("activity"),
        });
      }
      if (activityQueue.length > 0) {
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
    const silentStartCommands = new Set(["start", "pid", "interrupt", "interupt", "reload", "health", "session", "cwd", "context"]);
    const shouldAnnounceStart = !slash || !silentStartCommands.has(slash.command);
    if (shouldAnnounceStart) {
      activityLines.push("run started");
      if (bridge.upsertActivityMessage) {
        activityMessageToken = await bridge.upsertActivityMessage({
          conversation: envelope.conversation,
          text: renderActivityText("starting"),
        });
      } else {
        await bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: renderActivityText("starting"),
        });
      }
    }

    const program = routeInbound(envelope, {
      signal: controller.signal,
      onActivity: async (line) => {
        logger.info({ bridgeId: envelope.bridgeId, conversation: key, activity: line }, "[bui] OpenCode activity event.");
        activityQueue.push(line);
        scheduleActivityFlush();
      },
      onPermissionRequest: async (permission) => {
        logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id, type: permission.type }, "[bui] Permission request received from OpenCode.");
        const buttonKey = Math.random().toString(36).slice(2, 10);
        permissionButtonKeys.set(buttonKey, permission.id);
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
        await bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: permissionLines.join("\n"),
          buttons: [
            [
              { id: "permission-response", label: "Allow Once", value: `once:${buttonKey}` },
              { id: "permission-response", label: "Always Allow", value: `always:${buttonKey}` },
            ],
            [{ id: "permission-response", label: "Reject", value: `reject:${buttonKey}` }],
          ],
        });

        return await new Promise<"once" | "always" | "reject">((resolvePermission) => {
          const previous = pendingPermissions.get(permission.id);
          if (previous) {
            clearTimeout(previous.timer);
            previous.resolve("reject");
            permissionButtonKeys.delete(previous.buttonKey);
            markPermissionButtonKeySettled(previous.buttonKey, "expired");
            logger.warn(
              { bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id },
              "[bui] Replaced existing pending permission entry.",
            );
          }

          const timer = setTimeout(() => {
            pendingPermissions.delete(permission.id);
            permissionButtonKeys.delete(buttonKey);
            markPermissionButtonKeySettled(buttonKey, "expired");
            logger.warn({ bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id }, "[bui] Permission request timed out; rejecting.");
            void bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: `Permission request expired: ${permission.id}`,
            });
            resolvePermission("reject");
          }, permissionTimeoutMs);

          pendingPermissions.set(permission.id, {
            conversationKey: key,
            requesterUserId: envelope.user.id,
            buttonKey,
            resolve: (response) => {
              clearTimeout(timer);
              pendingPermissions.delete(permission.id);
              permissionButtonKeys.delete(buttonKey);
              markPermissionButtonKeySettled(buttonKey, "submitted");
              logger.info(
                { bridgeId: envelope.bridgeId, conversation: key, permissionId: permission.id, response },
                "[bui] Resolving pending permission response.",
              );
              resolvePermission(response);
            },
            timer,
          });

          logger.info(
            {
              bridgeId: envelope.bridgeId,
              conversation: key,
              permissionId: permission.id,
              pendingPermissionIds: [...pendingPermissions.keys()],
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
    let outbound;
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
        activityLines.push("run interrupted");
        if (bridge.upsertActivityMessage) {
          await bridge.upsertActivityMessage({
            conversation: envelope.conversation,
            text: renderActivityText("interrupted"),
            ...(activityMessageToken ? { token: activityMessageToken } : {}),
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
      activityLines.push(`run failed (${message})`);
      if (bridge.upsertActivityMessage) {
        await bridge.upsertActivityMessage({
          conversation: envelope.conversation,
          text: renderActivityText("failed"),
          ...(activityMessageToken ? { token: activityMessageToken } : {}),
        });
      }
      await bridge.send({
        bridgeId: envelope.bridgeId,
        conversation: envelope.conversation,
        text: `Run failed: ${message}`,
      });
      return;
    } finally {
      const active = activeRuns.get(key);
      if (active === controller) {
        activeRuns.delete(key);
      }
      scheduleSessionIdleExpiry(key);
    }

    activityLines.push("run completed");
    if (bridge.upsertActivityMessage) {
      activityMessageToken = await bridge.upsertActivityMessage({
        conversation: envelope.conversation,
        text: renderActivityText("completed"),
        ...(activityMessageToken ? { token: activityMessageToken } : {}),
      });
    }

    logger.info({ bridgeId: envelope.bridgeId, conversation: key, outboundCount: outbound.length }, "[bui] Outbound responses generated.");
    const maxAttachmentsRaw = Number.parseInt(process.env.BUI_MAX_ATTACHMENTS_PER_MESSAGE || "6", 10);
    const maxAttachmentsPerMessage = Number.isFinite(maxAttachmentsRaw) && maxAttachmentsRaw > 0 ? maxAttachmentsRaw : 6;
    const maxAttachmentBytesRaw = Number.parseInt(process.env.BUI_MAX_ATTACHMENT_BYTES || "10485760", 10);
    const maxAttachmentBytes = Number.isFinite(maxAttachmentBytesRaw) && maxAttachmentBytesRaw > 0 ? maxAttachmentBytesRaw : 10485760;

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
          const path = await captureScreenshot(input.config.paths.uploadDir, {
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
  };

  const flushBacklog = async (bridge: (typeof input.bridges)[number], key: string): Promise<void> => {
    const pending = pendingBacklog.get(key) || [];
    pendingBacklog.delete(key);
    if (pending.length === 0) {
      return;
    }
    pending.sort((a, b) => a.receivedAtUnixSeconds - b.receivedAtUnixSeconds);
    if (pending.length === 1) {
      const only = pending[0];
      if (only) {
        await processEnvelope(bridge, only);
      }
      return;
    }

    unresolvedBacklog.set(key, pending);
    const latest = pending[pending.length - 1];
    if (!latest) {
      return;
    }
    await bridge.send({
      bridgeId: latest.bridgeId,
      conversation: latest.conversation,
      text: `I received ${pending.length} queued messages while OpenCode BUI was offline. Choose how to continue.`,
      buttons: [
        [
          { id: "backlog-decision", label: "Process All", value: "all" },
          { id: "backlog-decision", label: "Latest Only", value: "latest" },
        ],
        [{ id: "backlog-decision", label: "Ignore", value: "ignore" }],
      ],
    });
  };

  const opencodeCommands = await discoverOpencodeCommands(input.config.discovery);
  const bridgeCommands = mergeBridgeCommands(nativeCommands, opencodeCommands);

  if (opencodeCommands.length > 0) {
    logger.info(`[bui] Discovered OpenCode commands: ${opencodeCommands.map((entry) => entry.command).join(", ")}`);
  } else {
    logger.info("[bui] No OpenCode markdown commands discovered.");
  }

  await Promise.all(
    input.bridges.map(async (bridge) => {
      await bridge.setCommands(bridgeCommands);
      logger.info(`[bui] Registered ${bridgeCommands.length} commands on bridge '${bridge.id}'.`);
    }),
  );

  await startAllBridges(input.bridges, {
    onInbound: async (envelope) => {
      const bridge = input.bridges.find((item) => item.id === envelope.bridgeId);
      if (!bridge) {
        logger.warn({ bridgeId: envelope.bridgeId }, "[bui] Received inbound for unknown bridge.");
        return;
      }
        logger.info({ bridgeId: envelope.bridgeId, eventType: envelope.event.type }, "[bui] Inbound event intercepted from bridge.");
        const key = conversationKey(envelope.conversation);
        conversationRefs.set(key, envelope.conversation);
        clearSessionIdleTimer(key);

        if (isInterruptEvent(envelope)) {
          const active = activeRuns.get(key);
          if (!active) {
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "No active run to interrupt.",
            });
            return;
          }

          active.abort();
          await bridge.send({
            bridgeId: envelope.bridgeId,
            conversation: envelope.conversation,
            text: "Interrupt signal sent.",
          });
          return;
        }

        const slash = parseSlashCommand(envelope);
        if (slash?.command === "context") {
          const mapping = await sessionStore.getSessionByConversation(envelope.conversation);
          const pendingForConversation = [...pendingPermissions.entries()]
            .filter(([, pending]) => pending.conversationKey === key)
            .map(([permissionId]) => permissionId);
          await bridge.send({
            bridgeId: envelope.bridgeId,
            conversation: envelope.conversation,
            text: [
              "Runtime context",
              `- Bridge: ${envelope.bridgeId}`,
              `- Conversation: ${key}`,
              `- Active run: ${activeRuns.has(key) ? "yes" : "no"}`,
              `- Session: ${mapping?.sessionId || "none"}`,
              `- Workspace: ${mapping?.cwd || "global default"}`,
              `- OpenCode attach mode: ${input.config.opencodeAttachUrl ? "remote" : "embedded"}`,
              `- Session idle timeout: ${input.config.sessionIdleTimeoutSeconds}s`,
              ...(input.config.opencodeAttachUrl ? [`- OpenCode attach URL: ${input.config.opencodeAttachUrl}`] : []),
              `- Pending permissions: ${pendingForConversation.length}`,
            ].join("\n"),
          });
          return;
        }

        const permissionFromText = parsePermissionResponseFromText(envelope);
        if (permissionFromText) {
          logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId: permissionFromText.permissionId, response: permissionFromText.response }, "[bui] Permission response received from text command.");
          const pending = pendingPermissions.get(permissionFromText.permissionId);
          if (!pending) {
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "No pending permission with that id.",
            });
            return;
          }
          if (pending.conversationKey !== key) {
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "Permission request belongs to another conversation.",
            });
            return;
          }
          if (pending.requesterUserId !== envelope.user.id) {
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "Only the requester can resolve this permission.",
            });
            return;
          }
          pending.resolve(permissionFromText.response);
          await bridge.send({
            bridgeId: envelope.bridgeId,
            conversation: envelope.conversation,
            text: `Permission response submitted: ${permissionFromText.response}`,
          });
          return;
        }

        if (envelope.event.type === "button" && envelope.event.actionId.startsWith("bui:permission-response:")) {
          const parts = envelope.event.actionId.split(":");
          const responseRaw = parts[2];
          const token = parts.slice(3).join(":");
          const mappedPermissionId = permissionButtonKeys.get(token);
          const response = responseRaw === "once" || responseRaw === "always" || responseRaw === "reject" ? responseRaw : "reject";
          logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId: mappedPermissionId, response }, "[bui] Permission button clicked.");

          if (!mappedPermissionId) {
            const settledState = settledPermissionButtonKeys.get(token);
            if (settledState === "submitted") {
              await bridge.send({
                bridgeId: envelope.bridgeId,
                conversation: envelope.conversation,
                text: "This permission request was already handled.",
              });
              return;
            }
            if (settledState === "expired") {
              await bridge.send({
                bridgeId: envelope.bridgeId,
                conversation: envelope.conversation,
                text: "This permission request has expired. Use the latest prompt or /permit <once|always|reject> <permissionId>.",
              });
              return;
            }
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "Permission button is stale (possibly from a previous run). Use the latest prompt or /permit <once|always|reject> <permissionId>.",
            });
            return;
          }

          logger.info(
            {
              bridgeId: envelope.bridgeId,
              conversation: key,
              pendingPermissionIds: [...pendingPermissions.keys()],
            },
            "[bui] Current pending permission ids.",
          );

          const pending = pendingPermissions.get(mappedPermissionId);
          if (!pending) {
            logger.warn(
              {
                bridgeId: envelope.bridgeId,
                conversation: key,
                permissionId: mappedPermissionId,
                pendingPermissionIds: [...pendingPermissions.keys()],
              },
              "[bui] No pending permission found for button response.",
            );
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "No pending permission request (it may have already expired or was from a previous run).",
            });
            return;
          }

          if (pending.conversationKey !== key) {
            logger.warn({ bridgeId: envelope.bridgeId, conversation: key, expectedConversation: pending.conversationKey, permissionId: mappedPermissionId }, "[bui] Permission response conversation mismatch.");
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "Permission request belongs to another conversation.",
            });
            return;
          }

          if (pending.requesterUserId !== envelope.user.id) {
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "Only the requester can resolve this permission.",
            });
            return;
          }

          pending.resolve(response);
          await bridge.send({
            bridgeId: envelope.bridgeId,
            conversation: envelope.conversation,
            text: `Permission response submitted: ${response}`,
          });
          return;
        }

        if (activeRuns.has(key) && (envelope.event.type === "text" || envelope.event.type === "slash")) {
          logger.info({ bridgeId: envelope.bridgeId, conversation: key }, "[bui] Active run already in progress for conversation.");
          await bridge.send({
            bridgeId: envelope.bridgeId,
            conversation: envelope.conversation,
            text: "Another run is in progress. Use /interrupt to cancel it first.",
          });
          return;
        }

        if (envelope.event.type === "media") {
          if (activeRuns.has(key)) {
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "Another run is in progress. Use /interrupt to cancel it first.",
            });
            return;
          }
          if (!bridge.downloadMedia) {
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "Media download is not configured for this bridge yet.",
            });
            return;
          }

          try {
            const mediaEnvelope = envelope as InboundEnvelope & { event: { type: "media"; fileId: string; fileName?: string; mimeType?: string } };
            const downloaded = await bridge.downloadMedia(mediaEnvelope);
            const storedPath = await mediaStore.saveRemoteFile({
              bridgeId: envelope.bridgeId,
              conversationId: key,
              ...(envelope.event.fileName || downloaded.fileNameHint ? { fileNameHint: envelope.event.fileName || downloaded.fileNameHint } : {}),
              bytes: downloaded.bytes,
            });

            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "Media received. Starting analysis...",
            });

            await processEnvelope(bridge, {
              ...envelope,
              event: {
                type: "text",
                text: [
                  `User uploaded a ${envelope.event.mediaKind} file at ${storedPath}.`,
                  ...(envelope.event.caption ? [`Caption: ${envelope.event.caption}`] : []),
                  "Analyze the file and help the user based on it.",
                ].join("\n"),
              },
            });
          } catch (error) {
            logger.error({ error, bridgeId: envelope.bridgeId }, "[bui] Media processing failed.");
            await bridge.send({
              bridgeId: envelope.bridgeId,
              conversation: envelope.conversation,
              text: "Could not download or process media for analysis.",
            });
          }
          return;
        }

        if (envelope.event.type === "button" && envelope.event.actionId.startsWith("bui:backlog-decision:")) {
          const unresolved = unresolvedBacklog.get(key) || [];
          unresolvedBacklog.delete(key);
          const decisionRaw = envelope.event.actionId.split(":")[2];
          const decision =
            decisionRaw === "all" || decisionRaw === "latest" || decisionRaw === "ignore"
              ? decisionRaw
              : "ignore";

          const selected = chooseBacklogMessages(unresolved, decision);
          for (const message of selected) {
            await processEnvelope(bridge, message);
          }
          return;
        }

        const unresolved = unresolvedBacklog.get(key);
        if (unresolved && unresolved.length > 0 && envelope.event.type === "text" && !envelope.event.text.trim().startsWith("/")) {
          unresolvedBacklog.delete(key);
          await processEnvelope(bridge, envelope);
          return;
        }

        const policy = bridgeDefinitionById(envelope.bridgeId).runtimePolicy(input.config);
        const backlogWindowMs = policy.backlog.batchWindowMs;
        const backlogStaleSeconds = policy.backlog.staleSeconds;
        const stale = isBacklogMessage(envelope.receivedAtUnixSeconds, clock.nowUnixSeconds(), backlogStaleSeconds);
        const canBacklog = envelope.event.type === "text" || envelope.event.type === "slash";

        if (policy.backlog.enabled && stale && canBacklog) {
          logger.info({ bridgeId: envelope.bridgeId, conversation: key }, "[bui] Queuing stale inbound message into backlog window.");
          const queue = pendingBacklog.get(key) || [];
          queue.push(envelope);
          pendingBacklog.set(key, queue);

          const previousTimer = backlogTimers.get(key);
          if (previousTimer) {
            clearTimeout(previousTimer);
          }
          const timer = setTimeout(() => {
            backlogTimers.delete(key);
            void flushBacklog(bridge, key);
          }, backlogWindowMs);
          backlogTimers.set(key, timer);
          return;
        }

        await processEnvelope(bridge, envelope);
    },
  });

  if (input.waitForShutdown === false) {
    return;
  }

  try {
    await waitForShutdownSignal();
  } finally {
    logger.info("[bui] Shutdown signal received. Stopping bridges.");
    await stopAllBridges(input.bridges);
    logger.info("[bui] Runtime stopped.");
  }

}
