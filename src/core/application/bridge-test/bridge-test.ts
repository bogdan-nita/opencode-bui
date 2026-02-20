import type { BridgeName, RuntimeConfig } from "@core/config";
import type { BridgeTestResult } from "./bridge-test.types";
import { bridgeDefinitionById } from "../bridge-registry";

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

export type { BridgeTestResult } from "./bridge-test.types";
