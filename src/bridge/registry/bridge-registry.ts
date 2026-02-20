import type { BridgeAdapter } from "../types/bridge-adapter.types";
import { discordBridgeDefinition } from "../adapters/discord/discord.definition";
import { telegramBridgeDefinition } from "../adapters/telegram/telegram.definition";
import type { RuntimeConfig } from "@config";
import type { BridgeRegistry } from "./bridge-registry.types";

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

export type { BridgeRegistry } from "./bridge-registry.types";
