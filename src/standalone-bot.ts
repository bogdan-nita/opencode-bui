import { bridgeDefinitionById, createBridgesForConfig } from "@core/application/bridge-registry";
import { startRuntime } from "@core/application/runtime";
import { readRuntimeConfig } from "@core/config";
import { logger } from "@infra/runtime/logger";

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

  await startRuntime({ config, bridges });
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to start standalone Telegram bridge: ${message}`);
  process.exit(1);
});
