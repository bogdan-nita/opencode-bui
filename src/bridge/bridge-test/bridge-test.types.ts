import type { BridgeName } from "@config";

export type BridgeTestResult = {
  bridge: BridgeName;
  ok: boolean;
  latencyMs: number;
  details: string;
};
