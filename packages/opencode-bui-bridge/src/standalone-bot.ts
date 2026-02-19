import { bridgeDefinitionById, createBridgesForConfig } from "@core/application/bridge-registry.utils.js";
import { startBuiRuntime } from "@core/application/bui-runtime.utils.js";
import { readRuntimeConfig } from "@core/config.js";
import { logger } from "@infra/runtime/logger.utils.js";

void (async () => {
  const config = await readRuntimeConfig({ fresh: true });
  bridgeDefinitionById("telegram").assertConfigured(config);

  const bridges = await createBridgesForConfig({
    ...config,
    bridges: {
      ...config.bridges,
      telegram: { ...config.bridges.telegram, enabled: true },
      discord: { ...config.bridges.discord, enabled: false },
    },
  });

  await startBuiRuntime({ config, bridges });
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to start standalone Telegram bridge: ${message}`);
  process.exit(1);
});
