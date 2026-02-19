import type { BridgeName } from "@core/config.js";

export type BridgeTestResult = {
  bridge: BridgeName;
  ok: boolean;
  latencyMs: number;
  details: string;
};
