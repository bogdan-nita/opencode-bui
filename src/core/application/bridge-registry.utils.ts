import type { BridgeAdapter } from "../ports/bridge-adapter.types.js";
import { discordBridgeDefinition } from "../../bridges/discord/discord.definition.js";
import { telegramBridgeDefinition } from "../../bridges/telegram/telegram.definition.js";
import type { RuntimeConfig } from "../../infra/config/config.types.js";
import type { BridgeRegistry } from "./bridge-registry.types.js";

export const defaultBridgeRegistry: BridgeRegistry = {
  telegram: telegramBridgeDefinition,
  discord: discordBridgeDefinition,
};

export async function createBridgesForConfig(config: RuntimeConfig): Promise<BridgeAdapter[]> {
  const bridges: BridgeAdapter[] = [];
  for (const definition of Object.values(defaultBridgeRegistry)) {
    if (!config.bridges[definition.id].enabled) {
      continue;
    }
    bridges.push(await definition.createAdapter(config));
  }
  return bridges;
}

export function bridgeDefinitionById(id: keyof BridgeRegistry) {
  return defaultBridgeRegistry[id];
}

export function allBridgeDefinitions() {
  return Object.values(defaultBridgeRegistry);
}
