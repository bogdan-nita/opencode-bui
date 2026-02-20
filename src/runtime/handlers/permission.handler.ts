import type { BridgeAdapter, InboundEnvelope, PermissionStore } from "@runtime/bridge/types";
import { conversationKey } from "@runtime/conversation-router";
import { logger } from "@runtime/logger";
import type { RuntimeState, PermissionDecision } from "../state/runtime-state.types";

export type ResolvePermissionDeps = {
  bridge: BridgeAdapter;
  envelope: InboundEnvelope;
  state: RuntimeState;
  permissionStore: PermissionStore;
};

export async function resolvePermissionDecision(
  deps: ResolvePermissionDeps,
  permissionId: string,
  response: PermissionDecision,
): Promise<boolean> {
  const { bridge, envelope, state, permissionStore } = deps;
  const key = conversationKey(envelope.conversation);

  logger.info({
    bridgeId: envelope.bridgeId,
    conversation: key,
    permissionId,
    response,
    actorUserId: envelope.user.id,
    pendingPermissionIds: [...state.pendingPermissions.keys()],
  }, "[bui] Resolving permission decision.");

  const record = await permissionStore.getByID(permissionId);
  if (!record) {
    await bridge.send({
      bridgeId: envelope.bridgeId,
      conversation: envelope.conversation,
      text: "No pending permission with that id.",
    });
    logger.warn({ bridgeId: envelope.bridgeId, conversation: key, permissionId }, "[bui] Permission response for unknown id.");
    return true;
  }

  logger.info({
    bridgeId: envelope.bridgeId,
    conversation: key,
    permissionId,
    recordStatus: record.status,
    recordConversation: record.conversationKey,
    recordRequester: record.requesterUserId,
    expiresAtUnixSeconds: record.expiresAtUnixSeconds,
  }, "[bui] Loaded permission record for decision.");

  if (record.conversationKey !== key) {
    await bridge.send({
      bridgeId: envelope.bridgeId,
      conversation: envelope.conversation,
      text: "Permission request belongs to another conversation.",
    });
    logger.warn({ bridgeId: envelope.bridgeId, conversation: key, permissionId, expectedConversation: record.conversationKey }, "[bui] Permission response conversation mismatch.");
    return true;
  }

  if (record.requesterUserId !== envelope.user.id) {
    await bridge.send({
      bridgeId: envelope.bridgeId,
      conversation: envelope.conversation,
      text: "Only the requester can resolve this permission.",
    });
    logger.warn({ bridgeId: envelope.bridgeId, conversation: key, permissionId, requesterUserId: record.requesterUserId, actorUserId: envelope.user.id }, "[bui] Permission response requester mismatch.");
    return true;
  }

  const resolution = await permissionStore.resolvePending({ permissionId, response });
  logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId, response, resolution }, "[bui] Permission store resolution result.");
  if (resolution === "expired") {
    await bridge.send({
      bridgeId: envelope.bridgeId,
      conversation: envelope.conversation,
      text: "This permission request has expired. Use the latest prompt or /permit <once|always|reject> <permissionId>.",
    });
    logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId }, "[bui] Permission response rejected because request expired.");
    return true;
  }

  if (resolution === "already_submitted") {
    await bridge.send({
      bridgeId: envelope.bridgeId,
      conversation: envelope.conversation,
      text: "This permission request was already handled.",
    });
    logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId }, "[bui] Duplicate permission response ignored.");
    return true;
  }

  if (resolution === "missing") {
    await bridge.send({
      bridgeId: envelope.bridgeId,
      conversation: envelope.conversation,
      text: "No pending permission with that id.",
    });
    logger.warn({ bridgeId: envelope.bridgeId, conversation: key, permissionId }, "[bui] Permission response missing at resolve step.");
    return true;
  }

  const pending = state.pendingPermissions.get(permissionId);
  if (pending) {
    pending.resolve(response);
    await bridge.send({
      bridgeId: envelope.bridgeId,
      conversation: envelope.conversation,
      text: `Permission response submitted: ${response}`,
    });
    logger.info({ bridgeId: envelope.bridgeId, conversation: key, permissionId, response }, "[bui] Permission resolved from active pending map.");
    return true;
  }

  await bridge.send({
    bridgeId: envelope.bridgeId,
    conversation: envelope.conversation,
    text: "Permission response recorded, but the originating run is no longer active.",
  });
  logger.warn({ bridgeId: envelope.bridgeId, conversation: key, permissionId, response }, "[bui] Permission resolved after pending handler was not found.");
  return true;
}
