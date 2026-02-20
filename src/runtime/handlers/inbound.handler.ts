import type { BridgeAdapter, BridgeRuntimeHandlers, InboundEnvelope, SessionStore, OpenCodeClient, PermissionStore, MediaStore, AgentStore, Clock } from "@runtime/bridge/types";
import { bridgeDefinitionById } from "@runtime/bridge/registry";
import { conversationKey } from "@runtime/conversation-router";
import { chooseBacklogMessages, isBacklogMessage } from "@runtime/backlog-coordinator";
import { logger } from "@runtime/logger";
import type { RuntimeState } from "../state/runtime-state.types";
import { clearSessionIdleTimer, scheduleSessionIdleExpiry } from "../state/runtime-state";
import { isInterruptEvent } from "../middleware/interrupt.middleware";
import { parseSlashCommand, parsePermissionResponseFromText } from "../middleware/slash-command.middleware";
import { processEnvelope } from "./envelope.handler";
import { flushBacklog } from "./backlog.handler";
import { resolvePermissionDecision } from "./permission.handler";
import type { RuntimeConfig } from "@runtime/config";

export type InboundHandlerDeps = {
  bridges: BridgeAdapter[];
  state: RuntimeState;
  config: RuntimeConfig;
  sessionStore: SessionStore;
  openCodeClient: OpenCodeClient;
  permissionStore: PermissionStore;
  mediaStore: MediaStore;
  agentStore: AgentStore;
  clock: Clock;
};

export function createInboundHandler(deps: InboundHandlerDeps): BridgeRuntimeHandlers["onInbound"] {
  const { bridges, state, config, sessionStore, openCodeClient, permissionStore, mediaStore, agentStore, clock } = deps;
  const sessionIdleTimeoutMs = config.sessionIdleTimeoutSeconds * 1000;

  return async (envelope: InboundEnvelope): Promise<void> => {
    const bridge = bridges.find((item) => item.id === envelope.bridgeId);
    if (!bridge) {
      logger.warn({ bridgeId: envelope.bridgeId }, "[bui] Received inbound for unknown bridge.");
      return;
    }

    logger.info({ bridgeId: envelope.bridgeId, eventType: envelope.event.type }, "[bui] Inbound event intercepted from bridge.");
    const key = conversationKey(envelope.conversation);
    state.conversationRefs.set(key, envelope.conversation);
    clearSessionIdleTimer(state, key);

    // Handle interrupt events
    if (isInterruptEvent(envelope)) {
      const active = state.activeRuns.get(key);
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

    // Handle /context command
    if (slash?.command === "context") {
      const mapping = await sessionStore.getSessionByConversation(envelope.conversation);
      const pendingForConversation = [...state.pendingPermissions.entries()]
        .filter(([, pending]) => pending.conversationKey === key)
        .map(([permissionId]) => permissionId);
      await bridge.send({
        bridgeId: envelope.bridgeId,
        conversation: envelope.conversation,
        text: [
          "Runtime context",
          `- Bridge: ${envelope.bridgeId}`,
          `- Conversation: ${key}`,
          `- Active run: ${state.activeRuns.has(key) ? "yes" : "no"}`,
          `- Session: ${mapping?.sessionId || "none"}`,
          `- Workspace: ${mapping?.cwd || "global default"}`,
          `- OpenCode attach mode: ${config.opencodeAttachUrl ? "remote" : "embedded"}`,
          `- Session idle timeout: ${config.sessionIdleTimeoutSeconds}s`,
          ...(config.opencodeAttachUrl ? [`- OpenCode attach URL: ${config.opencodeAttachUrl}`] : []),
          `- Pending permissions: ${pendingForConversation.length}`,
        ].join("\n"),
      });
      return;
    }

    // Handle permission response from text
    const permissionFromText = parsePermissionResponseFromText(envelope);
    if (permissionFromText) {
      const resolvedPermissionId = permissionFromText.permissionId || state.lastPermissionByConversation.get(key);
      logger.info({
        bridgeId: envelope.bridgeId,
        conversation: key,
        permissionId: resolvedPermissionId,
        response: permissionFromText.response,
        usedFallback: !permissionFromText.permissionId,
      }, "[bui] Permission response received from text command.");

      if (!resolvedPermissionId) {
        await bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: "No recent permission request found. Usage: /permit <once|always|reject> <permissionId>",
        });
        return;
      }

      await resolvePermissionDecision(
        { bridge, envelope, state, permissionStore },
        resolvedPermissionId,
        permissionFromText.response,
      );
      return;
    }

    // Handle /permit command without args
    if (slash?.command === "permit" || slash?.command === "permission") {
      await bridge.send({
        bridgeId: envelope.bridgeId,
        conversation: envelope.conversation,
        text: "Usage: /permit <once|always|reject> [permissionId]",
      });
      logger.warn({ bridgeId: envelope.bridgeId, conversation: key, args: slash.args }, "[bui] Invalid permit command format.");
      return;
    }

    // Handle /allow command without args
    if (slash?.command === "allow") {
      await bridge.send({
        bridgeId: envelope.bridgeId,
        conversation: envelope.conversation,
        text: "Usage: /allow <once|always|reject> [permissionId]",
      });
      logger.warn({ bridgeId: envelope.bridgeId, conversation: key, args: slash.args }, "[bui] Invalid allow command format.");
      return;
    }

    // Handle permission button clicks
    if (envelope.event.type === "button" && envelope.event.actionId.startsWith("bui:permission-response:")) {
      const parts = envelope.event.actionId.split(":");
      const responseRaw = parts[2];
      const permissionId = parts.slice(3).join(":");
      const response = responseRaw === "once" || responseRaw === "always" || responseRaw === "reject" ? responseRaw : "reject";
      logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId, response }, "[bui] Permission button clicked.");

      if (!permissionId) {
        await bridge.send({
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: "Permission button payload is invalid.",
        });
        return;
      }
      await resolvePermissionDecision({ bridge, envelope, state, permissionStore }, permissionId, response);
      return;
    }

    // Block new messages when a run is active
    if (state.activeRuns.has(key) && (envelope.event.type === "text" || envelope.event.type === "slash")) {
      logger.info({ bridgeId: envelope.bridgeId, conversation: key }, "[bui] Active run already in progress for conversation.");
      await bridge.send({
        bridgeId: envelope.bridgeId,
        conversation: envelope.conversation,
        text: "Another run is in progress. Use /interrupt to cancel it first.",
      });
      return;
    }

    // Handle media events
    if (envelope.event.type === "media") {
      if (state.activeRuns.has(key)) {
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

        await processEnvelope({
          bridge,
          envelope: {
            ...envelope,
            event: {
              type: "text",
              text: [
                `User uploaded a ${envelope.event.mediaKind} file at ${storedPath}.`,
                ...(envelope.event.caption ? [`Caption: ${envelope.event.caption}`] : []),
                "Analyze the file and help the user based on it.",
              ].join("\n"),
            },
          },
          state,
          sessionStore,
          openCodeClient,
          agentStore,
          clock,
          config: { uploadDir: config.paths.uploadDir },
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

    // Handle backlog decision button
    if (envelope.event.type === "button" && envelope.event.actionId.startsWith("bui:backlog-decision:")) {
      const unresolved = state.unresolvedBacklog.get(key) || [];
      state.unresolvedBacklog.delete(key);
      const decisionRaw = envelope.event.actionId.split(":")[2];
      const decision =
        decisionRaw === "all" || decisionRaw === "latest" || decisionRaw === "ignore"
          ? decisionRaw
          : "ignore";

      const selected = chooseBacklogMessages(unresolved, decision);
      for (const message of selected) {
        await processEnvelope({
          bridge,
          envelope: message,
          state,
          sessionStore,
          openCodeClient,
          agentStore,
          clock,
          config: { uploadDir: config.paths.uploadDir },
        });
      }
      return;
    }

    // Handle text message with unresolved backlog
    const unresolved = state.unresolvedBacklog.get(key);
    if (unresolved && unresolved.length > 0 && envelope.event.type === "text" && !envelope.event.text.trim().startsWith("/")) {
      state.unresolvedBacklog.delete(key);
      await processEnvelope({
        bridge,
        envelope,
        state,
        sessionStore,
        openCodeClient,
        agentStore,
        clock,
        config: { uploadDir: config.paths.uploadDir },
      });
      return;
    }

    // Get runtime policy
    const policy = bridgeDefinitionById(envelope.bridgeId).runtimePolicy(config);
    const backlogWindowMs = policy.backlog.batchWindowMs;
    const backlogStaleSeconds = policy.backlog.staleSeconds;
    const nowUnixSeconds = Math.floor(Date.now() / 1000);
    const stale = isBacklogMessage(envelope.receivedAtUnixSeconds, nowUnixSeconds, backlogStaleSeconds);
    const canBacklog = envelope.event.type === "text" || envelope.event.type === "slash";

    // Handle stale messages with backlog
    if (policy.backlog.enabled && stale && canBacklog) {
      logger.info({ bridgeId: envelope.bridgeId, conversation: key }, "[bui] Queuing stale inbound message into backlog window.");
      const queue = state.pendingBacklog.get(key) || [];
      queue.push(envelope);
      state.pendingBacklog.set(key, queue);

      const previousTimer = state.backlogTimers.get(key);
      if (previousTimer) {
        clearTimeout(previousTimer);
      }
      const timer = setTimeout(() => {
        state.backlogTimers.delete(key);
        void flushBacklog({
          bridge,
          key,
          state,
          sessionStore,
          openCodeClient,
          agentStore,
          clock,
          config: { uploadDir: config.paths.uploadDir },
        });
      }, backlogWindowMs);
      state.backlogTimers.set(key, timer);
      return;
    }

    // Process the envelope normally
    await processEnvelope({
      bridge,
      envelope,
      state,
      sessionStore,
      openCodeClient,
      agentStore,
      clock,
      config: { uploadDir: config.paths.uploadDir },
    });

    // Schedule session idle expiry after processing
    scheduleSessionIdleExpiry(state, key, sessionIdleTimeoutMs, async (conversation) => {
      await sessionStore.clearSessionForConversation(conversation);
    });
  };
}
