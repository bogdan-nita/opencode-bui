import { createOpenCodeClient } from "@opencode/open-code-client";
import { discoverOpencodeCommands, mergeBridgeCommands } from "@opencode/opencode-commands";
import { createSystemClock } from "@runtime/time/system-clock";
import { logger } from "@runtime/logger";
import { createRuntimeDB } from "@database/db";
import { createLibsqlSessionStore } from "@database/store/libsql-session-store";
import { createLibsqlAgentStore } from "@database/store/libsql-agent-store";
import { createFileMediaStore } from "@database/store/file-media-store";
import { createLibsqlPermissionStore } from "@database/store/libsql-permission-store";
import { startAllBridges, stopAllBridges, waitForShutdownSignal } from "@bridge/bridge-supervisor";
import type { RuntimeDependencies } from "./runtime.types";
import { nativeCommands } from "./commands.consts";
import { createRuntimeState } from "./state/runtime-state";
import { createInboundHandler } from "./handlers/inbound.handler";
import { startPluginBridgeServer } from "./handlers/plugin-bridge.handler";

export async function startRuntime(input: RuntimeDependencies): Promise<void> {
  logger.info(`[bui] Starting runtime with ${input.bridges.length} bridge(s).`);
  logger.info(`[bui] Using database: ${input.config.paths.dbPath}`);
  const database = await createRuntimeDB(input.config.paths.dbPath);

  const sessionStore = createLibsqlSessionStore(database);
  const agentStore = createLibsqlAgentStore(database);
  const mediaStore = createFileMediaStore(input.config.paths.uploadDir);
  const permissionStore = createLibsqlPermissionStore(database);
  const openCodeClient = createOpenCodeClient({
    opencodeBin: input.config.opencodeBin,
    ...(input.config.opencodeAttachUrl ? { attachUrl: input.config.opencodeAttachUrl } : {}),
  });

  if (process.env.BUI_OPENCODE_EAGER_START !== "0" && openCodeClient.warmup) {
    try {
      await openCodeClient.warmup();
      logger.info("[bui] OpenCode context warmed during runtime startup.");
    } catch (error) {
      logger.warn({ error }, "[bui] OpenCode warmup failed; runtime will retry on first request.");
    }
  }

  const clock = createSystemClock();
  const state = createRuntimeState();

  // Start plugin bridge server if enabled
  const pluginBridgeServer = await startPluginBridgeServer({
    runtimeDir: input.config.paths.runtimeDir,
    bridges: input.bridges,
    sessionStore,
  });

  // Discover and register commands
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

  // Create inbound handler
  const onInbound = createInboundHandler({
    bridges: input.bridges,
    state,
    config: input.config,
    sessionStore,
    openCodeClient,
    permissionStore,
    mediaStore,
    agentStore,
    clock,
  });

  // Start all bridges
  await startAllBridges(input.bridges, { onInbound });

  if (input.waitForShutdown === false) {
    return;
  }

  try {
    await waitForShutdownSignal();
  } finally {
    logger.info("[bui] Shutdown signal received. Stopping bridges.");
    if (pluginBridgeServer) {
      pluginBridgeServer.stop(true);
      logger.info("[bui] Plugin bridge server stopped.");
    }
    await stopAllBridges(input.bridges);
    logger.info("[bui] Runtime stopped.");
  }
}

export type { RuntimeDependencies } from "./runtime.types";
