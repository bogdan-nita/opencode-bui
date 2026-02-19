import type { BridgeName, RuntimeConfig } from "@core/config.js";
import type { BridgeTestResult } from "./bridge-test.types.js";
import { bridgeDefinitionById } from "./bridge-registry.utils.js";

export async function testBridgeConnectivity(input: {
  config: RuntimeConfig;
  bridges: BridgeName[];
  timeoutMs?: number;
}): Promise<BridgeTestResult[]> {
  const timeoutMs = input.timeoutMs ?? 8000;
  const results: BridgeTestResult[] = [];

  for (const bridge of input.bridges) {
    const definition = bridgeDefinitionById(bridge);
    results.push(await definition.healthcheck(input.config, timeoutMs));
  }

  return results;
}
