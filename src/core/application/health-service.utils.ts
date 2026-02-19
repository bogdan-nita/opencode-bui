import type { BridgeAdapter } from "../ports/bridge-adapter.types.js";

export async function collectBridgeHealth(bridges: BridgeAdapter[]): Promise<string[]> {
  const rows: string[] = [];
  for (const bridge of bridges) {
    const health = await bridge.health();
    rows.push(`- ${health.bridgeId}: ${health.status}${health.details ? ` (${health.details})` : ""}`);
  }
  return rows;
}
