#!/usr/bin/env bun
/**
 * Main entrypoint - composition root
 * Wires together all top-level modules: database, api, agent, runtime
 */

import { discoverConfigContext, readRuntimeConfig, enabledBridges, type BridgeName } from "@infra/config";
import { bridgeDefinitionById, createBridgesForConfig } from "@bridge/registry";
import { startRuntime } from "@core";
import { createRuntimeDB } from "@database";
import { createPluginBridgeClient } from "@api/client";
import { createOpenCodeClient } from "@agent";
import { ensureDir, fileExists } from "@infra/fs";
import { logger } from "@infra/logger";
import { resolve } from "node:path";

export interface MainOptions {
  cwd: string;
  bridge?: BridgeName;
  waitForShutdown?: boolean;
}

export interface MainResult {
  config: Awaited<ReturnType<typeof readRuntimeConfig>>;
  bridges: Awaited<ReturnType<typeof createBridgesForConfig>>;
  stop: () => Promise<void>;
}

/**
 * Main entrypoint - creates and wires all modules
 */
export async function main(options: MainOptions): Promise<MainResult> {
  const { cwd, bridge, waitForShutdown = true } = options;

  // 1. Load config
  const config = await readRuntimeConfig({ fresh: true, cwd });

  // 2. Ensure runtime directory exists
  await ensureDir(config.paths.runtimeDir);

  // 3. Determine which bridges to start
  const bridgesToStart = bridge ? [bridge] : enabledBridges(config);
  if (bridgesToStart.length === 0) {
    throw new Error("No bridges are enabled. Enable at least one bridge in config.");
  }

  // 4. Validate bridge configs
  for (const bridgeName of bridgesToStart) {
    const definition = bridgeDefinitionById(bridgeName);
    if (!definition) {
      throw new Error(`Unknown bridge: ${bridgeName}`);
    }
    definition.assertConfigured(config);
  }

  // 5. Create bridges
  const bridges = await createBridgesForConfig({
    ...config,
    bridges: {
      ...config.bridges,
      telegram: { ...config.bridges.telegram, enabled: bridgesToStart.includes("telegram") },
      discord: { ...config.bridges.discord, enabled: bridgesToStart.includes("discord") },
    },
  });

  // 6. Start runtime (this creates database, agent client, and starts everything)
  await startRuntime({ config, bridges, waitForShutdown });

  return {
    config,
    bridges,
    stop: async () => {
      logger.info("[bui] Stopping...");
    },
  };
}

/**
 * Check if auto-onboarding is needed
 */
export async function needsOnboarding(cwd: string): Promise<boolean> {
  const discovery = await discoverConfigContext(cwd);
  if (discovery.nearestBuiConfig) {
    return false;
  }

  const globalConfigPath = resolve(
    process.env.HOME ?? process.cwd(),
    ".config",
    "opencode",
    "bui",
    "opencode-bui.config.ts",
  );
  return !(await fileExists(globalConfigPath));
}

// Re-export for convenience
export { startRuntime } from "@core";
export { createRuntimeDB } from "@database";
export { createOpenCodeClient } from "@agent";
export { createPluginBridgeClient } from "@api/client";
